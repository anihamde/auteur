import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { newId } from "@auteur/ids/new-id";
import { seedSession } from "@auteur/test-db/seed-session";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import {
  claimStage,
  completeStage,
  enqueueStage,
  failStage,
  findQueueEntry,
  MAX_ATTEMPTS,
} from "../../src/queue.ts";
import {
  claimSweep,
  findStaleClaims,
  releaseStaleClaim,
} from "../../src/sweep.ts";

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
    label: `queue-${counter.toString()}`,
  });
  return seeded.sessionId;
};

describe("two concurrent claims on one row: exactly one succeeds", () => {
  test("the loser gets undefined, not a second claim", async () => {
    // The property the whole stage-per-invocation model rests on. A cron sweep
    // racing a live invocation must not run the stage twice, and a
    // read-then-write claim has a window where both callers have seen
    // 'queued'.
    const sessionId = await freshSession();
    const id = newId();
    await enqueueStage(harness.db, { id, sessionId, stageId: "draft" });

    const [a, b] = await Promise.all([
      claimStage(harness.db, id, "invocation-a"),
      claimStage(harness.other, id, "invocation-b"),
    ]);

    const winners = [a, b].filter((entry) => entry !== undefined);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.status).toBe("claimed");

    const stored = await findQueueEntry(harness.db, id);
    expect(stored?.claimedBy).toBe(winners[0]?.claimedBy ?? "");
  });

  test("eight concurrent claims still yield exactly one", async () => {
    const sessionId = await freshSession();
    const id = newId();
    await enqueueStage(harness.db, { id, sessionId, stageId: "outline" });

    const results = await Promise.all(
      Array.from({ length: 8 }, async (_, index) =>
        claimStage(harness.db, id, `invocation-${index.toString()}`),
      ),
    );
    expect(results.filter((entry) => entry !== undefined)).toHaveLength(1);
  });
});

describe("only the claimant may finish its own row", () => {
  test("completing under another claimant's name changes nothing", async () => {
    const sessionId = await freshSession();
    const id = newId();
    await enqueueStage(harness.db, { id, sessionId, stageId: "draft" });
    await claimStage(harness.db, id, "mine");

    expect(await completeStage(harness.db, id, "someone-else")).toBe(false);
    expect((await findQueueEntry(harness.db, id))?.status).toBe("claimed");
    expect(await completeStage(harness.db, id, "mine")).toBe(true);
    expect((await findQueueEntry(harness.db, id))?.status).toBe("done");
  });

  test("enqueueing the same stage and attempt twice inserts once", async () => {
    // A stage's last act is to enqueue the next. If the invocation is retried
    // after that enqueue committed, the second call must be a no-op rather than
    // a second copy of the next stage.
    const sessionId = await freshSession();
    const first = await enqueueStage(harness.db, {
      id: newId(),
      sessionId,
      stageId: "critique",
    });
    const second = await enqueueStage(harness.db, {
      id: newId(),
      sessionId,
      stageId: "critique",
    });
    expect(first).toBeDefined();
    expect(second).toBeUndefined();
  });
});

describe("attempts, and the point at which the queue gives up", () => {
  test("a failure under the budget releases at attempt + 1 as a new row", async () => {
    const sessionId = await freshSession();
    const id = newId();
    await enqueueStage(harness.db, { id, sessionId, stageId: "draft" });
    await claimStage(harness.db, id, "inv-1");

    const outcome = await failStage(harness.db, id, "inv-1", newId());
    expect(outcome.outcome).toBe("released");
    if (outcome.outcome !== "released") return;
    expect(outcome.next.attempt).toBe(1);
    expect(outcome.next.status).toBe("queued");
    // The failed row survives, so the queue keeps what was tried.
    expect((await findQueueEntry(harness.db, id))?.status).toBe("error");
  });

  test("a row past the retry limit is failed rather than released again", async () => {
    // Otherwise a stage that fails deterministically loops until someone turns
    // the cron off.
    const sessionId = await freshSession();
    let id = newId();
    await enqueueStage(harness.db, { id, sessionId, stageId: "draft" });

    for (let attempt = 0; attempt < MAX_ATTEMPTS - 1; attempt += 1) {
      await claimStage(harness.db, id, "inv");
      const next = newId();
      const outcome = await failStage(harness.db, id, "inv", next);
      expect(outcome.outcome).toBe("released");
      id = next;
    }

    await claimStage(harness.db, id, "inv");
    expect((await failStage(harness.db, id, "inv", newId())).outcome).toBe(
      "failed",
    );
  });

  test("failing a row nobody claimed is refused", async () => {
    const sessionId = await freshSession();
    const id = newId();
    await enqueueStage(harness.db, { id, sessionId, stageId: "draft" });
    expect((await failStage(harness.db, id, "inv", newId())).outcome).toBe(
      "not-claimed",
    );
  });
});

describe("the sweep finds what a lost invocation left behind", () => {
  test("a claim older than the threshold is returned and a fresh one is not", async () => {
    const sessionId = await freshSession();
    const stale = newId();
    const fresh = newId();
    await enqueueStage(harness.db, {
      id: stale,
      sessionId,
      stageId: "draft",
    });
    await enqueueStage(harness.db, {
      id: fresh,
      sessionId,
      stageId: "outline",
    });
    await claimStage(harness.db, stale, "lost");
    await claimStage(harness.db, fresh, "alive");
    await harness.db.query(
      `UPDATE stage_queue SET claimed_at = now() - interval '20 minutes'
        WHERE id = $1`,
      [stale],
    );

    const found = await findStaleClaims(harness.db);
    expect(found.map((claim) => claim.id)).toEqual([stale]);
  });

  test("releasing re-checks the age, so a revived invocation is not stolen", async () => {
    // Between the sweep's read and its write the original invocation can come
    // back and complete. Trusting the read would put a finished stage back on
    // the queue.
    const sessionId = await freshSession();
    const id = newId();
    await enqueueStage(harness.db, { id, sessionId, stageId: "draft" });
    await claimStage(harness.db, id, "lost");
    await harness.db.query(
      `UPDATE stage_queue SET claimed_at = now() - interval '20 minutes'
        WHERE id = $1`,
      [id],
    );

    // The invocation comes back and finishes before the sweep writes.
    expect(await completeStage(harness.db, id, "lost")).toBe(true);
    expect(await releaseStaleClaim(harness.db, id)).toBe(false);
    expect((await findQueueEntry(harness.db, id))?.status).toBe("done");
  });

  test("a genuinely stale claim goes back to queued and can be claimed again", async () => {
    const sessionId = await freshSession();
    const id = newId();
    await enqueueStage(harness.db, { id, sessionId, stageId: "draft" });
    await claimStage(harness.db, id, "lost");
    await harness.db.query(
      `UPDATE stage_queue SET claimed_at = now() - interval '20 minutes'
        WHERE id = $1`,
      [id],
    );

    expect(await releaseStaleClaim(harness.db, id)).toBe(true);
    const reclaimed = await claimStage(harness.db, id, "sweeper");
    expect(reclaimed?.claimedBy).toBe("sweeper");
  });
});

describe("the queue cascades with its session", () => {
  test("deleting a session leaves no queue rows behind", async () => {
    const sessionId = await freshSession();
    await enqueueStage(harness.db, {
      id: newId(),
      sessionId,
      stageId: "draft",
    });
    await harness.db.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
    const rows = await harness.db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM stage_queue WHERE session_id = $1`,
      [sessionId],
    );
    expect(rows.rows[0]?.["n"]).toBe("0");
  });
});

describe("only one instance sweeps per window", () => {
  test("two concurrent claims on the sweep: exactly one wins", async () => {
    // The throttle has to hold across function instances, which do not share
    // memory. Held in a module-level timestamp this would let every cold start
    // sweep immediately — and a cold start per request is the normal case on
    // this platform, so the throttle would be no throttle at all.
    await harness.db.query(
      `UPDATE sweep_state SET last_swept_at = now() - interval '1 hour'`,
    );

    const [a, b] = await Promise.all([
      claimSweep(harness.db, 30),
      claimSweep(harness.other, 30),
    ]);

    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  test("a claim inside the window is refused, and outside it granted", async () => {
    await harness.db.query(
      `UPDATE sweep_state SET last_swept_at = now() - interval '1 hour'`,
    );
    expect(await claimSweep(harness.db, 30)).toBe(true);
    expect(await claimSweep(harness.db, 30)).toBe(false);
    // Zero seconds is what a test uses to mean "now"; the comparison is
    // strictly less-than, so the row must be aged rather than the window
    // shrunk to nothing.
    await harness.db.query(
      `UPDATE sweep_state SET last_swept_at = now() - interval '31 seconds'`,
    );
    expect(await claimSweep(harness.db, 30)).toBe(true);
  });
});
