import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SessionEvent } from "@auteur/core/events";
import { createDb } from "@auteur/db/db";
import { newId } from "@auteur/ids/new-id";
import { seedSession } from "@auteur/test-db/seed-session";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import { append, channelFor, latestSeq, readSince } from "../../src/events.ts";
import { subscribe } from "../../src/listen.ts";
import {
  claimRun,
  findRun,
  finishRun,
  isCancelRequested,
  requestCancel,
} from "../../src/session-runs.ts";

let harness: TestDb;

beforeAll(async () => {
  harness = await createTestDb();
});

afterAll(async () => {
  await harness.close();
});

let counter = 0;
const freshSession = async (): Promise<string> => {
  counter += 1;
  const seeded = await seedSession(harness.db, {
    label: `events-${counter.toString()}`,
  });
  return seeded.sessionId;
};

const aStep = (): SessionEvent => ({ step: "outline", type: "step" });
const aDetail = (line: string): SessionEvent => ({
  line,
  stageId: "research",
  type: "stage_detail",
});

describe("seq is gap-free from 1", () => {
  test("a cursor of 0 means the beginning, so no event may carry seq 0", async () => {
    const sessionId = await freshSession();
    const first = await append(harness.db, sessionId, aStep());
    expect(first.seq).toBe(1);
    expect(await latestSeq(harness.db, sessionId)).toBe(1);
  });

  test("200 concurrent appends produce 1..200 with no gap and no duplicate", async () => {
    // The property the whole stream rests on. `seq` is allocated by the insert
    // rather than read and passed in: two callers computing max+1 in
    // TypeScript both get the same number, and the primary key rejects one for
    // a reason the user cannot act on.
    const sessionId = await freshSession();
    await Promise.all(
      Array.from({ length: 200 }, async (_, index) =>
        append(harness.db, sessionId, aDetail(`line ${index.toString()}`)),
      ),
    );

    const stored = await readSince(harness.db, sessionId, 0, 1000);
    expect(stored.map((event) => event.seq)).toEqual(
      Array.from({ length: 200 }, (_, index) => index + 1),
    );
  }, 60_000);

  test("readSince returns strictly after the cursor", async () => {
    const sessionId = await freshSession();
    await append(harness.db, sessionId, aDetail("one"));
    const second = await append(harness.db, sessionId, aDetail("two"));

    const after = await readSince(harness.db, sessionId, 1);
    expect(after.map((event) => event.seq)).toEqual([second.seq]);
  });

  test("a stored payload is parsed on the way out, not trusted", async () => {
    // The stream contract makes an unparseable frame fatal, so a payload shape
    // that changed under a deploy must fail here — where it names the session —
    // rather than in the browser.
    const sessionId = await freshSession();
    await harness.db.query(
      `INSERT INTO events (session_id, seq, type, payload)
       VALUES ($1, 1, 'step', '{"type":"step","step":"nonsense"}'::jsonb)`,
      [sessionId],
    );
    await expect(readSince(harness.db, sessionId)).rejects.toThrow();
  });
});

describe("append happens before fan-out, never the other way round", () => {
  test("every event a subscriber is woken for is already in the table", async () => {
    // An event a subscriber saw but the table did not is lost on the next
    // reconnect: the client advances its cursor past a seq it can never
    // replay. Postgres holds a NOTIFY until commit, so putting it inside the
    // append's transaction is what makes the order structural rather than a
    // convention someone has to remember.
    const sessionId = await freshSession();
    const listener = createDb({
      endpoint: "direct",
      max: 1,
      url: harness.url,
    });
    const seen: number[] = [];
    const checks: Promise<boolean>[] = [];
    try {
      const subscription = await subscribe(listener, sessionId, (seq) => {
        seen.push(seq);
        checks.push(
          harness.other
            .query<{ n: string }>(
              `SELECT count(*)::text AS n FROM events
                WHERE session_id = $1 AND seq = $2`,
              [sessionId, seq],
            )
            .then((result) => result.rows[0]?.["n"] === "1"),
        );
      });

      for (let index = 0; index < 5; index += 1) {
        await append(harness.db, sessionId, aDetail(index.toString()));
      }
      // Notifications arrive on their own connection; give them a turn.
      for (let attempt = 0; attempt < 100 && seen.length < 5; attempt += 1) {
        await Bun.sleep(20);
      }

      expect(seen).toEqual([1, 2, 3, 4, 5]);
      expect(await Promise.all(checks)).toEqual([true, true, true, true, true]);
      await subscription.close();
    } finally {
      await listener.close();
    }
  }, 30_000);

  test("the channel is derived from the session and is a plain identifier", async () => {
    // It is spliced into LISTEN, which cannot parameterize its channel. The
    // hyphens come out so the result is an identifier by construction rather
    // than by hoping the quoting holds.
    const channel = channelFor("4b1c9f2e-0000-7000-8000-abcdefabcdef");
    expect(channel).toMatch(/^[a-z_][a-z0-9_]*$/);
    expect(channelFor("a-b")).not.toBe(channelFor("ab"));
  });

  test("a subscription on a pooled handle is refused rather than silently deaf", async () => {
    // LISTEN through pooled-mode PgBouncer is accepted and then never
    // delivers. A stream that stays open and silent forever is the worst shape
    // this failure can take.
    const pooled = createDb({ endpoint: "pooled", max: 1, url: harness.url });
    try {
      await expect(
        subscribe(pooled, await freshSession(), () => undefined),
      ).rejects.toThrow("needs the direct database endpoint");
    } finally {
      await pooled.close();
    }
  });
});

describe("a lost connection ends one subscription, not the process", () => {
  test("a terminated backend is survivable, and the next subscriber gets a live connection", async () => {
    // `pg` removes its own error listener when a client is checked out, so a
    // backend that dies mid-stream — Neon scaling to zero, a restart, an admin
    // terminating it — emits `error` on an emitter with nothing listening. In
    // Node that is an unhandled `error` event, and it takes the process with
    // it: one dropped connection would end every stream and every request on
    // the instance rather than the one stream that lost its connection.
    const sessionId = await freshSession();
    const listener = createDb({ endpoint: "direct", max: 1, url: harness.url });
    try {
      const subscription = await subscribe(
        listener,
        sessionId,
        () => undefined,
      );

      const pids = await harness.other.query<{ pid: number }>(
        `SELECT pid FROM pg_stat_activity
          WHERE datname = current_database() AND query LIKE 'LISTEN %'`,
      );
      expect(pids.rows.length).toBeGreaterThan(0);
      for (const row of pids.rows) {
        await harness.other.query(`SELECT pg_terminate_backend($1)`, [
          row["pid"],
        ]);
      }

      for (
        let attempt = 0;
        attempt < 200 && !subscription.lost();
        attempt += 1
      ) {
        await Bun.sleep(10);
      }
      expect(subscription.lost()).toBe(true);
      // Closing after the loss is a no-op rather than a throw: the route calls
      // it on abort and again in its `finally`.
      await subscription.close();

      // The pool holds one connection, so this only succeeds if the dead one
      // was handed back rather than left checked out.
      const next = await subscribe(listener, sessionId, () => undefined);
      await next.close();
    } finally {
      await listener.close();
    }
  }, 20_000);
});

describe("a connection lost while closing is still handed back", () => {
  test("close() resolves and the pool's only slot is free again", async () => {
    // `close()` marks itself closed before awaiting `UNLISTEN`, so a backend
    // dying during that round trip used to reach an error listener that saw
    // "already closing" and returned without releasing — while the rejected
    // `UNLISTEN` threw past the release. The client stayed checked out for the
    // life of the process, and four of those empty a direct pool: the failure
    // the error listener exists to prevent, reached by the other path.
    const sessionId = await freshSession();
    const listener = createDb({ endpoint: "direct", max: 1, url: harness.url });
    try {
      const subscription = await subscribe(
        listener,
        sessionId,
        () => undefined,
      );
      const pids = await harness.other.query<{ pid: number }>(
        `SELECT pid FROM pg_stat_activity
          WHERE datname = current_database() AND query LIKE 'LISTEN %'`,
      );

      for (const row of pids.rows) {
        await harness.other.query(`SELECT pg_terminate_backend($1)`, [
          row["pid"],
        ]);
      }
      // Closed without waiting for the error event, so `UNLISTEN` goes to a
      // connection that is already gone. It resolves rather than throwing: a
      // caller asking to stop listening does not need an error about the
      // listening having already stopped, and this is awaited inside a
      // stream's `finally` where a throw becomes an unhandled rejection.
      await subscription.close();

      // The pool holds one connection. This is the assertion that the slot came
      // back rather than being lost with the client.
      const next = await subscribe(listener, sessionId, () => undefined);
      await next.close();
    } finally {
      await listener.close();
    }
  }, 20_000);
});

describe("the run claim stops a double-clicked advance", () => {
  test("two claims on one session: one wins, one gets undefined", async () => {
    const sessionId = await freshSession();
    const [a, b] = await Promise.all([
      claimRun(harness.db, sessionId, "request-a"),
      claimRun(harness.other, sessionId, "request-b"),
    ]);
    expect([a, b].filter((run) => run !== undefined)).toHaveLength(1);
  });

  test("a finished run's session can be claimed again", async () => {
    const sessionId = await freshSession();
    const first = await claimRun(harness.db, sessionId, "run-1");
    expect(first).toBeDefined();
    expect(await claimRun(harness.db, sessionId, "run-2")).toBeUndefined();

    expect(await finishRun(harness.db, sessionId, "run-1", "done")).toBe(true);
    const second = await claimRun(harness.db, sessionId, "run-2");
    expect(second?.claimedBy).toBe("run-2");
    expect(second?.cancelRequested).toBe(false);
  });

  test("only the claimant may finish its own run", async () => {
    const sessionId = await freshSession();
    await claimRun(harness.db, sessionId, "mine");
    expect(await finishRun(harness.db, sessionId, "theirs", "done")).toBe(
      false,
    );
    expect((await findRun(harness.db, sessionId))?.status).toBe("running");
  });

  test("cancel sets a flag and does not decide the outcome", async () => {
    // A run cancelled the instant before it finishes should record what
    // actually happened, and only the run itself knows that.
    const sessionId = await freshSession();
    await claimRun(harness.db, sessionId, "run");
    expect(await requestCancel(harness.db, sessionId)).toBe(true);
    expect(await isCancelRequested(harness.db, sessionId)).toBe(true);
    expect((await findRun(harness.db, sessionId))?.status).toBe("running");

    await finishRun(harness.db, sessionId, "run", "done");
    expect((await findRun(harness.db, sessionId))?.status).toBe("done");
  });

  test("cancelling a session with no run in flight is false, not an error", async () => {
    expect(await requestCancel(harness.db, await freshSession())).toBe(false);
    expect(await isCancelRequested(harness.db, newId())).toBe(false);
  });
});
