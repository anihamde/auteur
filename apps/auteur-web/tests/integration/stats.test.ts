import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { append } from "@auteur/event-store/events";
import { newId } from "@auteur/ids/new-id";
import { createSession } from "@auteur/session-store/sessions";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import { collect, median, render } from "../../../../scripts/stats.ts";

/**
 * §10's two numbers, against a seeded database.
 *
 * Hand-computed rather than snapshotted: the point of the test is that the
 * query measures what §10 says it measures, and a snapshot would agree with
 * whatever the query happened to return.
 */

let harness: TestDb;

beforeAll(async () => {
  harness = await createTestDb();
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.db.query(`DELETE FROM sessions`);
});

const seedSession = async (): Promise<string> => {
  const session = await createSession(harness.db, {
    id: newId(),
    idea: "a lighthouse keeper",
    lengthPreset: "flash",
  });
  return session.id;
};

/** A run that started research at `startedAt` and drafted `afterMs` later. */
const seedRun = async (
  sessionId: string,
  startedAt: Date,
  afterMs: number | undefined,
  costMicros = 0,
): Promise<void> => {
  await harness.db.query(
    `INSERT INTO stage_runs (id, session_id, stage_id, attempt, status,
                             cost_micros, started_at)
     VALUES ($1, $2, 'corpus-select', 0, 'ok', $3, $4)`,
    [newId(), sessionId, costMicros, startedAt],
  );
  if (afterMs === undefined) return;
  await append(harness.db, sessionId, {
    stageId: "draft",
    text: "The lamp turned.",
    type: "stage_delta",
  });
  await harness.db.query(
    `UPDATE events SET created_at = $2
      WHERE session_id = $1 AND payload->>'type' = 'stage_delta'`,
    [sessionId, new Date(startedAt.getTime() + afterMs)],
  );
};

describe("completion rate", () => {
  test("it is the share of sessions that reached a draft token", async () => {
    const drafted = await seedSession();
    const abandoned = await seedSession();
    await seedRun(drafted, new Date(), 60_000);
    await seedRun(abandoned, new Date(), undefined);

    const stats = await collect(harness.db);
    expect(stats.sessions).toBe(2);
    expect(stats.reachedDraft).toBe(1);
    expect(stats.completionRate).toBe(0.5);
  });

  test("with no sessions it is zero, not a division by zero", async () => {
    const stats = await collect(harness.db);
    expect(stats.sessions).toBe(0);
    expect(stats.completionRate).toBe(0);
    expect(stats.medianTimeToDraftMs).toBeUndefined();
  });
});

describe("time to draft", () => {
  test("it measures corpus-select's start to the draft's first token", async () => {
    // §10's target is about when a reader stops waiting, and that is when
    // prose starts appearing — not when the story is finished.
    const session = await seedSession();
    const started = new Date("2026-01-01T10:00:00Z");
    await seedRun(session, started, 90_000);

    const stats = await collect(harness.db);
    expect(stats.timeToDraftMs).toEqual([90_000]);
    expect(stats.medianTimeToDraftMs).toBe(90_000);
  });

  test("a run still in flight is not counted as a slow one", async () => {
    // Averaging it in would report a number that improves when a session is
    // abandoned.
    const done = await seedSession();
    const running = await seedSession();
    await seedRun(done, new Date(), 60_000);
    await seedRun(running, new Date(), undefined);
    expect((await collect(harness.db)).timeToDraftMs).toEqual([60_000]);
  });

  test("the median of an even count is the mean of the two middles", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(median([30, 10, 20])).toBe(20);
    expect(median([])).toBeUndefined();
  });
});

describe("spend", () => {
  test("it sums what was recorded at write time", async () => {
    // §10.2: cost is computed when the stage runs, so a later price change
    // does not rewrite the history of what a session cost.
    const session = await seedSession();
    await seedRun(session, new Date(), 60_000, 250_000);
    const stats = await collect(harness.db);
    expect(stats.costMicros).toBe(250_000);
    expect(render(stats)).toContain("$0.25");
  });
});
