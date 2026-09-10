import { AuteurError } from "@auteur/errors/auteur-error";
import pg from "pg";

/**
 * Which Neon endpoint a handle opens.
 *
 * `docs/ARCHITECTURE.md` §3.1: almost every route uses **pooled**, because
 * instances are plural and short-lived and a direct connection per invocation
 * exhausts the server. The SSE route uses **direct**, because `LISTEN` is a
 * session-level feature that pooled-mode PgBouncer does not support — a
 * `LISTEN` issued through the pooler is accepted and then simply never
 * delivers, which is the worst shape a failure can take.
 */
export type Endpoint = "pooled" | "direct";

export type DbConfig = {
  readonly url: string;
  readonly endpoint: Endpoint;
  /** Overridden only by `@auteur/test-db`. */
  readonly max?: number;
  /**
   * How long a caller waits for a free connection before the pool refuses.
   *
   * `pg` waits for ever by default, and for ever inside a serverless function
   * means until the platform kills the invocation: the caller learns nothing,
   * the row it was writing stays whatever it was, and the log says only that
   * the function timed out. A pool with no free connection is a fact worth
   * saying out loud.
   */
  readonly connectionTimeoutMs?: number;
};

/**
 * Long enough to outlast a burst, short enough to be a message and not a hang.
 *
 * Five seconds was the first answer and it was wrong, in the direction that
 * matters: it turned *waiting* into an error. Two hundred concurrent appends
 * over a pool of four queue legitimately, and under load the last of them
 * waited longer than five seconds and was refused — a burst the pool would have
 * served, reported as a pool with nothing free.
 *
 * A queue is not a stuck pool. What this exists to catch is the second one:
 * connections held and never returned, which is a wait that does not end. So it
 * is set well above any queue this application produces and well below the
 * platform's sixty-second ceiling, which is the thing it was introduced to stop
 * a caller from reaching in silence.
 */
export const CONNECTION_TIMEOUT_MS = 15_000;

export type Db = {
  readonly endpoint: Endpoint;
  readonly query: <Row extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ) => Promise<pg.QueryResult<Row>>;
  /**
   * Run `fn` inside a transaction on one connection.
   *
   * Only a `direct` handle offers this. A pooled handle in transaction mode
   * hands each statement to whichever backend is free, so `BEGIN` and `COMMIT`
   * can land on different connections — the transaction appears to work and
   * guarantees nothing.
   */
  readonly transaction: <Result>(
    fn: (client: pg.PoolClient) => Promise<Result>,
  ) => Promise<Result>;
  /** A dedicated connection, for `LISTEN`. Direct handles only. */
  readonly connect: () => Promise<pg.PoolClient>;
  readonly close: () => Promise<void>;
};

const refusePooled = (what: string): never => {
  throw new AuteurError(
    "internal",
    `${what} needs the direct database endpoint. A pooled connection hands each statement to whichever backend is free, so this cannot hold — see ARCHITECTURE.md §3.1.`,
  );
};

/**
 * The deprecated SSL aliases, spelled as what they currently mean.
 *
 * `pg` treats `prefer`, `require` and `verify-ca` as `verify-full` today and
 * warns — with a stack trace, on every connection — that in `pg` 9 they will
 * adopt libpq semantics instead, which do **not** verify the certificate chain.
 * So the alias is a downgrade scheduled for a version bump nobody will
 * connect to this behaviour.
 *
 * Writing `verify-full` keeps exactly what happens now, survives that bump
 * unchanged, and silences a warning that prints a stack trace and reads, to
 * anyone running a script, as a crash. Nothing here weakens: `verify-full` is
 * the strongest of the modes and the one already in force.
 *
 * A url that names any other mode — `disable`, `no-verify`, or none at all —
 * is left exactly as written. This function replaces a deprecated spelling of
 * the current behaviour; it does not decide anybody's TLS policy.
 */
const DEPRECATED_SSL_MODES = new Set(["prefer", "require", "verify-ca"]);

export const withCurrentSslSemantics = (url: string): string => {
  try {
    const parsed = new URL(url);
    const mode = parsed.searchParams.get("sslmode");
    if (mode === null || !DEPRECATED_SSL_MODES.has(mode)) {
      return url;
    }
    parsed.searchParams.set("sslmode", "verify-full");
    return parsed.toString();
  } catch {
    // Not a url this can parse is a url to hand on untouched: `pg` accepts
    // shapes `URL` does not, and rewriting is a convenience, never a gate.
    return url;
  }
};

export const createDb = (config: DbConfig): Db => {
  const pool = new pg.Pool({
    connectionString: withCurrentSslSemantics(config.url),
    connectionTimeoutMillis:
      config.connectionTimeoutMs ?? CONNECTION_TIMEOUT_MS,
    max: config.max ?? (config.endpoint === "direct" ? 4 : 1),
  });

  return {
    close: async () => {
      await pool.end();
    },
    connect: async () => {
      if (config.endpoint !== "direct") {
        return refusePooled("A dedicated connection");
      }
      return pool.connect();
    },
    endpoint: config.endpoint,
    query: async (text, values) =>
      pool.query(text, values === undefined ? undefined : [...values]),
    transaction: async (fn) => {
      if (config.endpoint !== "direct") {
        return refusePooled("A transaction");
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (cause) {
        await client.query("ROLLBACK");
        throw cause;
      } finally {
        client.release();
      }
    },
  };
};
