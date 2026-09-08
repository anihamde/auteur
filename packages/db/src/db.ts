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
};

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

export const createDb = (config: DbConfig): Db => {
  const pool = new pg.Pool({
    connectionString: config.url,
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
