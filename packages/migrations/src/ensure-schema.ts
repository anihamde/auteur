import type { Db } from "@auteur/db/db";
import { AuteurError } from "@auteur/errors/auteur-error";
import { MIGRATIONS, type Migration } from "./generated/manifest.ts";

/**
 * A constant, so every process contends for the same lock. Arbitrary but fixed:
 * changing it would let two deploys migrate concurrently.
 */
const ADVISORY_LOCK_KEY = 4_073_215_001;

/** Memoized per `Db` handle rather than per module. */
const inFlight = new WeakMap<Db, Promise<void>>();

type Client = {
  query: <Row extends { [column: string]: unknown }>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
  release: () => void;
};

const readLedger = async (
  client: Client,
): Promise<Map<number, { name: string; checksum: string }>> => {
  const present = await client.query<{ present: boolean }>(
    `SELECT to_regclass('_auteur_migrations') IS NOT NULL AS present`,
  );
  const applied = new Map<number, { name: string; checksum: string }>();
  if (present.rows[0]?.present !== true) {
    return applied;
  }
  const rows = await client.query<{
    version: number;
    name: string;
    checksum: string;
  }>(`SELECT version, name, checksum FROM _auteur_migrations`);
  for (const row of rows.rows) {
    applied.set(row.version, { checksum: row.checksum, name: row.name });
  }
  return applied;
};

const verifyChecksums = (
  applied: ReadonlyMap<number, { name: string; checksum: string }>,
): void => {
  for (const migration of MIGRATIONS) {
    const record = applied.get(migration.version);
    if (record !== undefined && record.checksum !== migration.checksum) {
      throw new AuteurError(
        "internal",
        `Migration ${migration.version.toString()}_${migration.name} has been edited since it was applied. Never edit an applied migration: the recorded state and the real schema would diverge silently. Roll forward with a new migration instead.`,
      );
    }
  }
};

/**
 * Apply `migration` and record it, atomically.
 *
 * Its ledger row is written **inside** the same transaction as its DDL, so a
 * migration that throws part-way leaves no row and no partial schema and the
 * next run retries it from the beginning.
 */
const applyOne = async (
  client: Client,
  migration: Migration,
): Promise<void> => {
  await client.query("BEGIN");
  try {
    await client.query(migration.sql);
    await client.query(
      `INSERT INTO _auteur_migrations (version, name, checksum) VALUES ($1, $2, $3)`,
      [migration.version, migration.name, migration.checksum],
    );
    await client.query("COMMIT");
  } catch (cause) {
    await client.query("ROLLBACK");
    throw cause;
  }
};

/**
 * Apply whatever migrations are outstanding.
 *
 * **Fast path is one statement.** `SELECT max(version)` on an up-to-date
 * database, and it never takes the lock — which matters because this runs on
 * the first use of every function invocation, and taking an advisory lock per
 * request would serialize the whole application behind a check that almost
 * always says "nothing to do".
 *
 * **Slow path takes a session-level `pg_advisory_lock` *outside* any
 * transaction.** That ordering is load-bearing and was got wrong once: with
 * `pg_advisory_xact_lock` issued as the first statement *inside* a transaction,
 * the statement's snapshot is taken when the statement begins and the lock is
 * granted later — so a waiter can be released by the winner's commit and still
 * be reading from a snapshot that predates it. Twelve concurrent callers then
 * all see an empty ledger and all try to apply migration 1, and eleven of them
 * fail on the primary key. Taking the lock first, then beginning each
 * migration's transaction, means every snapshot is taken after the previous
 * writer committed.
 *
 * **The two handles are not interchangeable.** The fast path is a single
 * statement and belongs on whatever handle the caller already has — pooled, in
 * the deployment, because that is what every route uses. The slow path holds a
 * session-level lock across several statements, which a pooled connection
 * cannot do: it hands each statement to whichever backend is free, so a lock
 * taken by one statement is not held for the next. `migrateWith` is therefore
 * a **direct** handle, and defaults to `db` only because a test's handle is
 * already direct.
 *
 * Getting this wrong has no local symptom and a total one in production: every
 * integration suite runs against a direct handle, and the deployment's first
 * request — on the empty database, where the slow path is the only path —
 * fails and keeps failing.
 *
 * Nobody runs a migration by hand, in any environment. `bun run migration:new`
 * scaffolds a file; it does not apply one.
 */
export const ensureSchema = async (
  db: Db,
  migrateWith: Db = db,
): Promise<void> => {
  const existing = inFlight.get(db);
  if (existing !== undefined) {
    return existing;
  }

  const run = (async (): Promise<void> => {
    const latest = MIGRATIONS.at(-1)?.version ?? 0;
    const upToDate = await db
      .query<{ version: number | null }>(
        `SELECT max(version)::int AS version FROM _auteur_migrations`,
      )
      .then((result) => (result.rows[0]?.version ?? 0) >= latest)
      // The ledger does not exist yet, which is not an error — it is what the
      // first migration creates.
      .catch(() => false);
    if (upToDate) {
      return;
    }

    const client = (await migrateWith.connect()) as unknown as Client;
    try {
      await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
      try {
        // Re-read under the lock: another process may have applied everything
        // between the fast-path read and the lock being granted.
        const applied = await readLedger(client);
        verifyChecksums(applied);
        for (const migration of MIGRATIONS) {
          if (!applied.has(migration.version)) {
            await applyOne(client, migration);
          }
        }
      } finally {
        await client.query("SELECT pg_advisory_unlock($1)", [
          ADVISORY_LOCK_KEY,
        ]);
      }
    } finally {
      client.release();
    }
  })();

  inFlight.set(db, run);
  try {
    await run;
  } catch (cause) {
    // A failed run must not stay memoized: the next caller has to retry rather
    // than await a rejected promise for the life of the process.
    inFlight.delete(db);
    throw cause;
  }
};

/** Test seam. Nothing in `apps/` calls this. */
export const resetSchemaMemoForTest = (db: Db): void => {
  inFlight.delete(db);
};
