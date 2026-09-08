import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "@auteur/db/db";
import { fixtureId, seedSession } from "../../src/seed-session.ts";
import { createTestDb, type TestDb } from "../../src/test-db.ts";

let harness: TestDb;

beforeAll(async () => {
  harness = await createTestDb();
});

afterAll(async () => {
  await harness.close();
});

describe("two suites in parallel do not see each other's rows", () => {
  test("the same fixture label seeded in both is two databases, not a conflict", async () => {
    // The isolation this harness sells. If it were one database with unique
    // ids, a suite asserting `count(*) = 1` would pass alone and fail under
    // `turbo test`, which is the worst shape a test failure can take.
    const other = await createTestDb();
    try {
      await seedSession(harness.db, { label: "shared-name" });
      await seedSession(other.db, { label: "shared-name" });

      for (const suite of [harness, other]) {
        const rows = await suite.db.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM sessions WHERE id = $1`,
          [fixtureId("session:shared-name")],
        );
        expect(rows.rows[0]?.n).toBe("1");
      }

      expect(other.url).not.toBe(harness.url);
    } finally {
      await other.close();
    }
  }, 30_000);
});

describe("teardown runs even when a test throws", () => {
  test("close() drops the database and survives an open connection", async () => {
    // A leaked database is not a correctness problem but it is a slow leak in a
    // suite that runs on every push. `WITH (FORCE)` is what makes it hold when
    // a test left a handle open — which is what a throwing test does.
    const leaked = await createTestDb();
    const stray = createDb({ endpoint: "direct", max: 1, url: leaked.url });
    await stray.query(`SELECT 1`);

    await leaked.close();
    await stray.close();

    const admin = createDb({
      endpoint: "direct",
      max: 1,
      url: harness.adminUrl,
    });
    try {
      const name = new URL(leaked.url).pathname.slice(1);
      const rows = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_database WHERE datname = $1`,
        [name],
      );
      expect(rows.rows[0]?.n).toBe("0");
    } finally {
      await admin.close();
    }
  }, 30_000);
});

describe("the fixture is deterministic", () => {
  test("the same label yields the same uuid on every run and every machine", async () => {
    // Not a constant assertion: the point is that two *calls* agree, and that
    // the value is a uuid Postgres accepts, which the seed below proves.
    expect(fixtureId("session:a")).toBe(fixtureId("session:a"));
    expect(fixtureId("session:a")).not.toBe(fixtureId("session:b"));
    expect(fixtureId("session:a")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  test("seeding twice under one label is a primary key violation, not a second row", async () => {
    await seedSession(harness.db, { label: "twice" });
    await expect(seedSession(harness.db, { label: "twice" })).rejects.toThrow();
  });

  test("the seeded rows satisfy the real schema's foreign keys", async () => {
    const seeded = await seedSession(harness.db, { label: "fk" });
    const rows = await harness.db.query<{ author_id: string }>(
      `SELECT author_id FROM works WHERE id = $1`,
      [seeded.workId],
    );
    expect(rows.rows[0]?.author_id).toBe(seeded.authorId);
  });
});
