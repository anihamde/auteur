import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { readSince } from "@auteur/event-store/events";
import { newId } from "@auteur/ids/new-id";
import { createSession } from "@auteur/session-store/sessions";
import {
  claimStage,
  enqueueStage,
  findQueueEntry,
  MAX_ATTEMPTS,
} from "@auteur/stage-queue/queue";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import { sweep } from "../../api/_cron/sweep.ts";

/**
 * The sweep, against a real database and real clock arithmetic.
 *
 * The thresholds are injected as zero seconds rather than waiting five minutes:
 * `now() - make_interval(secs => 0)` is `now()`, so every row already older
 * than this instant qualifies, which is exactly the condition under test.
 */

let harness: TestDb;
let sessionId: string;
const invoked: { queueId: string; stageId: string }[] = [];

beforeAll(async () => {
  harness = await createTestDb();
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  invoked.length = 0;
  // The sweep is deliberately global — a cron job has no session — so each
  // case starts from an empty queue rather than inheriting the last one's rows.
  await harness.db.query(`DELETE FROM stage_queue`);
  const session = await createSession(harness.db, {
    id: newId(),
    idea: "a lighthouse keeper",
    lengthPreset: "flash",
  });
  sessionId = session.id;
});

const run = async (thresholds: { stale?: number; queued?: number } = {}) =>
  sweep({
    db: harness.db,
    invokeStage: async ({ queueId, stageId }) => {
      invoked.push({ queueId, stageId });
    },
    queuedAfterSeconds: thresholds.queued ?? 0,
    staleAfterSeconds: thresholds.stale ?? 0,
  });

const queued = async (stageId = "outline", attempt = 0): Promise<string> => {
  const id = newId();
  await enqueueStage(harness.db, { attempt, id, sessionId, stageId });
  return id;
};

describe("a row queued and never claimed is re-invoked", () => {
  test("the sweep asks for it to run and leaves it queued", async () => {
    // It takes no claim: whoever answers claims it, so a sweep racing a late
    // invocation is the same race the claim already settles.
    const id = await queued();
    const result = await run();

    expect(result.reinvoked).toEqual([id]);
    expect(invoked).toEqual([{ queueId: id, stageId: "outline" }]);
    expect((await findQueueEntry(harness.db, id))?.status).toBe("queued");
  });

  test("a row queued more recently than the threshold is left alone", async () => {
    const id = await queued();
    const result = await run({ queued: 3600 });
    expect(result.reinvoked).toEqual([]);
    expect(invoked).toEqual([]);
    expect((await findQueueEntry(harness.db, id))?.status).toBe("queued");
  });
});

describe("a claim that stopped moving", () => {
  test("is released for another attempt and re-invoked", async () => {
    const id = await queued();
    await claimStage(harness.db, id, "the-lost-invocation");

    const result = await run();
    expect(result.released).toEqual([id]);
    expect(result.failed).toEqual([]);

    const entry = await findQueueEntry(harness.db, id);
    expect(entry?.status).toBe("queued");
    expect(entry?.claimedBy).toBeNull();
    expect(invoked.map((call) => call.queueId)).toEqual([id]);
  });

  test("out of budget, it fails the run and says why", async () => {
    // Without the event the stream simply stops, which reads as a slow stage
    // rather than a finished one.
    const id = await queued("outline", MAX_ATTEMPTS - 1);
    await claimStage(harness.db, id, "the-lost-invocation");

    const result = await run();
    expect(result.failed).toEqual([id]);
    expect(result.released).toEqual([]);
    expect((await findQueueEntry(harness.db, id))?.status).toBe("error");

    const events = await readSince(harness.db, sessionId, 0);
    const failure = events.find((event) => event.event.type === "stage_error");
    expect(failure).toBeDefined();
  });

  test("nothing is re-invoked for a run that has ended", async () => {
    const id = await queued("outline", MAX_ATTEMPTS - 1);
    await claimStage(harness.db, id, "the-lost-invocation");
    await run();
    expect(invoked).toEqual([]);
  });
});

describe("a healthy in-flight row is left alone", () => {
  test("a claim younger than the threshold is not touched", async () => {
    // Sweeping a live stage is the failure mode this must not have.
    const id = await queued();
    await claimStage(harness.db, id, "a-live-invocation");

    const result = await run({ stale: 3600 });
    expect(result.released).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(invoked).toEqual([]);

    const entry = await findQueueEntry(harness.db, id);
    expect(entry?.status).toBe("claimed");
    expect(entry?.claimedBy).toBe("a-live-invocation");
  });

  test("a completed row is not swept, however old", async () => {
    const id = await queued();
    await claimStage(harness.db, id, "someone");
    await harness.db.query(
      `UPDATE stage_queue SET status = 'done' WHERE id = $1`,
      [id],
    );
    const result = await run();
    expect(result).toEqual({ failed: [], reinvoked: [], released: [] });
  });

  test("a stage that finishes between the read and the write is not failed", async () => {
    // Every write repeats its age condition, so the update changes nothing.
    const id = await queued("outline", MAX_ATTEMPTS - 1);
    await claimStage(harness.db, id, "someone");
    await harness.db.query(
      `UPDATE stage_queue SET status = 'done' WHERE id = $1`,
      [id],
    );
    const result = await run();
    expect(result.failed).toEqual([]);
    expect((await findQueueEntry(harness.db, id))?.status).toBe("done");
  });
});
