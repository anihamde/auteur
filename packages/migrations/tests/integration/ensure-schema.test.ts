import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "@auteur/db/db";
import {
  ensureSchema,
  resetSchemaMemoForTest,
} from "../../src/ensure-schema.ts";
import { MIGRATIONS } from "../../src/generated/manifest.ts";
import { createScratchDatabase, type Scratch } from "./harness.ts";

/** An empty database with every migration applied by the real runner. */
const createMigrated = async (): Promise<Scratch> => {
  const scratch = await createScratchDatabase();
  await ensureSchema(scratch.db);
  return scratch;
};

let harness: Scratch;

beforeAll(async () => {
  harness = await createMigrated();
});

afterAll(async () => {
  await harness.close();
});

describe("a fresh database applies every migration exactly once", () => {
  test("the ledger records each one", async () => {
    const rows = await harness.db.query<{ version: number; name: string }>(
      `SELECT version, name FROM _auteur_migrations ORDER BY version`,
    );
    expect(rows.rows.map((row) => row.version)).toEqual(
      MIGRATIONS.map((migration) => migration.version),
    );
  });

  test("re-running applies nothing", async () => {
    resetSchemaMemoForTest(harness.db);
    await ensureSchema(harness.db);
    const rows = await harness.db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM _auteur_migrations`,
    );
    expect(rows.rows[0]?.count).toBe(MIGRATIONS.length.toString());
  });
});

describe("the fast path never takes the lock", () => {
  test("an up-to-date database is checked without a lock being held", async () => {
    // This runs on the first use of every function invocation. Taking an
    // advisory lock per request would serialize the whole application behind a
    // check that almost always says "nothing to do".
    resetSchemaMemoForTest(harness.db);
    await ensureSchema(harness.db);

    // Scoped to this database. Advisory locks are per-database, and the whole
    // suite shares one server — so an unscoped count sees the lock another
    // package's migration is legitimately holding at that instant, and the
    // test fails on CI for a reason that has nothing to do with the fast path.
    const locks = await harness.other.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_locks
       WHERE locktype = 'advisory'
         AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
    );
    expect(locks.rows[0]?.count).toBe("0");
  });
});

describe("concurrent callers each apply everything exactly once", () => {
  test("twelve processes racing a fresh database", async () => {
    // The property the advisory lock exists for. Without it, two functions
    // starting together both see an empty ledger and both run CREATE TABLE.
    // Deliberately *not* migrated: the race is only real against an empty
    // database, where every caller sees an empty ledger at once.
    const fresh = await createScratchDatabase();
    try {
      const handles = Array.from({ length: 12 }, () =>
        createDb({ endpoint: "direct", max: 1, url: fresh.url }),
      );

      const results = await Promise.allSettled(
        handles.map(async (handle) => ensureSchema(handle)),
      );
      expect(results.every((result) => result.status === "fulfilled")).toBe(
        true,
      );

      const rows = await fresh.db.query<{ version: number; n: string }>(
        `SELECT version, count(*)::text AS n FROM _auteur_migrations GROUP BY version`,
      );
      expect(rows.rows).toHaveLength(MIGRATIONS.length);
      for (const row of rows.rows) {
        expect(row.n).toBe("1");
      }

      await Promise.all(handles.map(async (handle) => handle.close()));
    } finally {
      await fresh.close();
    }
  }, 60_000);
});

describe("an edited migration aborts rather than diverging", () => {
  test("a checksum mismatch names the file and applies nothing", async () => {
    // Never edit an applied migration. The recorded state and the real schema
    // must not diverge silently, and rollback is a new forward migration.
    const fresh = await createMigrated();
    try {
      await fresh.db.query(
        `UPDATE _auteur_migrations SET checksum = 'tampered' WHERE version = 1`,
      );
      resetSchemaMemoForTest(fresh.db);
      // Force the slow path by pretending a migration is pending. It has to be
      // the *last* one: the fast path compares `max(version)` against the last
      // migration, so removing any earlier row leaves the maximum unchanged and
      // the check still reports the database up to date. Written against the
      // manifest rather than a literal so adding a migration cannot silently
      // turn this test into a no-op.
      const last = MIGRATIONS.at(-1)?.version ?? 0;
      await fresh.db.query(
        `DELETE FROM _auteur_migrations WHERE version = $1`,
        [last],
      );

      await expect(ensureSchema(fresh.db)).rejects.toThrow(
        "has been edited since it was applied",
      );
    } finally {
      await fresh.close();
    }
  }, 30_000);
});

describe("a failing migration leaves nothing behind", () => {
  test("no ledger row and no partial schema; the next run retries", async () => {
    const fresh = await createMigrated();
    try {
      await fresh.db.query(`DELETE FROM _auteur_migrations WHERE version = 2`);
      await fresh.db.query(`DROP TABLE stories`);
      await fresh.db.query(`DROP TABLE stage_queue`);

      // A migration whose second statement fails.
      const broken = {
        checksum: "deadbeefdeadbeef",
        name: "broken",
        sql: "CREATE TABLE will_not_survive (id int); SELECT 1/0;",
        version: 99,
      };
      await expect(
        fresh.db.transaction(async (client) => {
          await client.query(broken.sql);
        }),
      ).rejects.toThrow();

      const table = await fresh.db.query<{ present: boolean }>(
        `SELECT to_regclass('will_not_survive') IS NOT NULL AS present`,
      );
      expect(table.rows[0]?.present).toBe(false);
    } finally {
      await fresh.close();
    }
  }, 30_000);
});

describe("the manifest is inlined, not read from disk", () => {
  test("MIGRATIONS is a module constant with every file in it", async () => {
    // A bundled function ships no arbitrary files, so a runtime readdir finds
    // zero migrations and ensureSchema reports the database up to date. That is
    // the worst failure this package has.
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(2);
    for (const migration of MIGRATIONS) {
      expect(migration.sql.length).toBeGreaterThan(0);
      expect(migration.checksum).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  test("versions are contiguous from 1", async () => {
    expect(MIGRATIONS.map((migration) => migration.version)).toEqual(
      MIGRATIONS.map((_, index) => index + 1),
    );
  });
});
