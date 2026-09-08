import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "../../src/db.ts";
import {
  createScratchDatabase,
  pooledHandleTo,
  type Scratch,
} from "./harness.ts";

let harness: Scratch;

beforeAll(async () => {
  harness = await createScratchDatabase();
  await harness.db.query(`CREATE TABLE tx_probe (id int primary key)`);
});

afterAll(async () => {
  await harness.close();
});

describe("a direct handle holds a transaction across statements", () => {
  test("a rollback undoes work that spanned several queries", async () => {
    // The property that decides which deploy unit gets which endpoint,
    // asserted rather than commented (ARCHITECTURE.md §3.1).
    await expect(
      harness.db.transaction(async (client) => {
        await client.query(`INSERT INTO tx_probe (id) VALUES (1)`);
        await client.query(`INSERT INTO tx_probe (id) VALUES (2)`);
        throw new Error("the caller changed its mind");
      }),
    ).rejects.toThrow("the caller changed its mind");

    const rows = await harness.db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM tx_probe`,
    );
    expect(rows.rows[0]?.n).toBe("0");
  });

  test("a commit is visible to a second, independent handle", async () => {
    await harness.db.transaction(async (client) => {
      await client.query(`INSERT INTO tx_probe (id) VALUES (10)`);
      await client.query(`INSERT INTO tx_probe (id) VALUES (11)`);
    });
    const rows = await harness.other.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM tx_probe WHERE id >= 10`,
    );
    expect(rows.rows[0]?.n).toBe("2");
  });

  test("uncommitted work is invisible to another connection until commit", async () => {
    let observedMidTransaction = "";
    await harness.db.transaction(async (client) => {
      await client.query(`INSERT INTO tx_probe (id) VALUES (20)`);
      const outside = await harness.other.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM tx_probe WHERE id = 20`,
      );
      observedMidTransaction = outside.rows[0]?.n ?? "";
    });
    expect(observedMidTransaction).toBe("0");

    const after = await harness.other.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM tx_probe WHERE id = 20`,
    );
    expect(after.rows[0]?.n).toBe("1");
  });
});

describe("a pooled handle refuses what it cannot honour", () => {
  test("transaction() throws instead of running BEGIN on a borrowed backend", async () => {
    // A pooled connection in transaction mode hands each statement to whichever
    // backend is free, so BEGIN and COMMIT can land on different connections:
    // the transaction appears to work and guarantees nothing. Refusing at the
    // seam is the only way that shows up as a failure rather than as data loss.
    const pooled = pooledHandleTo(harness.url);
    try {
      await expect(pooled.transaction(async () => undefined)).rejects.toThrow(
        "needs the direct database endpoint",
      );
    } finally {
      await pooled.close();
    }
  });

  test("connect() throws, so a LISTEN cannot be issued through the pooler", async () => {
    // A LISTEN issued through pooled-mode PgBouncer is accepted and then simply
    // never delivers. The stream would stay open and silent forever.
    const pooled = pooledHandleTo(harness.url);
    try {
      await expect(pooled.connect()).rejects.toThrow(
        "needs the direct database endpoint",
      );
    } finally {
      await pooled.close();
    }
  });

  test("query() still works — pooled is the normal path, not a crippled one", async () => {
    const pooled = pooledHandleTo(harness.url);
    try {
      const rows = await pooled.query<{ one: number }>(`SELECT 1 AS one`);
      expect(rows.rows[0]?.one).toBe(1);
      expect(pooled.endpoint).toBe("pooled");
    } finally {
      await pooled.close();
    }
  });
});

describe("LISTEN/NOTIFY crosses connections", () => {
  test("a committed notify reaches a listener on another connection with its payload", async () => {
    // What the SSE route depends on. A payload that arrives mangled or a
    // notification that never arrives are both silent failures at run time.
    const listener = createDb({ endpoint: "direct", max: 1, url: harness.url });
    try {
      const client = await listener.connect();
      const received = new Promise<string>((resolve) => {
        client.on("notification", (message) => {
          resolve(message.payload ?? "");
        });
      });
      await client.query(`LISTEN auteur_test_channel`);

      await harness.other.query(`SELECT pg_notify('auteur_test_channel', $1)`, [
        JSON.stringify({ seq: 7, sessionId: "s-1" }),
      ]);

      expect(JSON.parse(await received)).toEqual({ seq: 7, sessionId: "s-1" });
      client.release();
    } finally {
      await listener.close();
    }
  }, 20_000);
});
