import { createDb, type Db } from "@auteur/db/db";
import { identifier } from "@auteur/db/sql";
import { ensureSchema } from "@auteur/migrations/ensure-schema";

/**
 * A real Postgres for a test suite, migrated by the real runner.
 *
 * There is no mocked database anywhere in `packages/` — if a test needs one,
 * the test is wrong. Every store's guarantees are guarantees *of Postgres*: a
 * unique constraint, a conditional update that either claims a row or does not,
 * a foreign key that cascades. A mock asserts that the code called the mock.
 *
 * Isolation is a **database per suite**, created from a template, rather than a
 * transaction rolled back at the end. Two of the properties these suites exist
 * to test — a conditional claim racing itself, and `LISTEN`/`NOTIFY` crossing
 * connections — need more than one real connection, which a single wrapping
 * transaction cannot give.
 */
const ADMIN_URL =
  Bun.env["AUTEUR_TEST_DATABASE_URL"] ??
  "postgres://auteur@127.0.0.1:55432/postgres";

export type TestDb = {
  readonly db: Db;
  /** A second handle to the same database, for testing concurrency. */
  readonly other: Db;
  readonly url: string;
  /** The server this database was created on, for asserting it was dropped. */
  readonly adminUrl: string;
  readonly close: () => Promise<void>;
};

const uniqueName = (): string =>
  `auteur_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const urlFor = (database: string): string => {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${database}`;
  return url.toString();
};

/**
 * Create a fresh database, apply every migration, and return two handles to it.
 *
 * `close()` drops the database and runs even when a test throws, provided the
 * caller puts it in an `afterAll`. A leaked database is not a correctness
 * problem but it is a slow leak in a suite that runs on every push.
 */
export const createTestDb = async (): Promise<TestDb> => {
  const admin = createDb({ endpoint: "direct", max: 1, url: ADMIN_URL });
  const name = uniqueName();
  await admin.query(`CREATE DATABASE ${identifier(name)}`);
  await admin.close();

  const url = urlFor(name);
  const db = createDb({ endpoint: "direct", max: 4, url });
  const other = createDb({ endpoint: "direct", max: 4, url });
  await ensureSchema(db);

  return {
    adminUrl: ADMIN_URL,
    close: async () => {
      await db.close();
      await other.close();
      const cleanup = createDb({ endpoint: "direct", max: 1, url: ADMIN_URL });
      await cleanup.query(
        `DROP DATABASE IF EXISTS ${identifier(name)} WITH (FORCE)`,
      );
      await cleanup.close();
    },
    db,
    other,
    url,
  };
};
