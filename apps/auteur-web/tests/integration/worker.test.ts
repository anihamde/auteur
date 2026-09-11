import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { AuteurError } from "@auteur/errors/auteur-error";
import { readSince } from "@auteur/event-store/events";
import { newId } from "@auteur/ids/new-id";
import { createLogger } from "@auteur/logger/logger";
import { createSession } from "@auteur/session-store/sessions";
import { claimNext } from "@auteur/stage-queue/claim-next";
import {
  enqueueStage,
  findQueueEntry,
  listQueueForSession,
} from "@auteur/stage-queue/queue";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import type { StageBody } from "../../server/_internal/run-stage.ts";
import { startWorker, tick } from "../../server/_internal/worker.ts";

/**
 * The loop that replaced the deployment calling itself.
 *
 * `stage_queue` was a queue in name and a workaround in fact: a serverless
 * function cannot watch a table, so the deployment invoked itself over HTTP,
 * with an HMAC, a `waitUntil`, a protection-bypass header and a sweep to catch
 * what was lost. All of that was the sixty-second ceiling, and none of it was
 * the pipeline.
 */

let harness: TestDb;
let sessionId: string;
const silent = createLogger({ bound: {} });

beforeAll(async () => {
  harness = await createTestDb();
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  // The worker takes the oldest row in the *table*, not in a session — one
  // worker drains everything. So each case starts from an empty queue, or it
  // is reading whatever successors the last one enqueued.
  await harness.db.query(`DELETE FROM stage_queue`);
  const session = await createSession(harness.db, {
    id: newId(),
    idea: "a lighthouse keeper",
    lengthPreset: "flash",
  });
  sessionId = session.id;
});

const noop: StageBody = async () => undefined;

const deps = (body: StageBody = noop) => ({
  db: harness.db,
  eventDb: harness.db,
  logger: silent,
  runStageBody: body,
});

const queue = async (stageId: string): Promise<string> => {
  const id = newId();
  await enqueueStage(harness.db, { id, sessionId, stageId });
  return id;
};

describe("a tick takes the oldest queued row and runs it", () => {
  test("the row completes and its successors are enqueued", async () => {
    const id = await queue("corpus-select");
    expect(await tick(deps())).toBe("ran");

    expect((await findQueueEntry(harness.db, id))?.status).toBe("done");
    expect(
      (await listQueueForSession(harness.db, sessionId)).map(
        (row) => row.stageId,
      ),
    ).toContain("work-fetch");
  });

  test("nothing queued is idle, not an error", async () => {
    // The ordinary state: a worker spends most of its life here.
    expect(await tick(deps())).toBe("idle");
  });

  test("oldest first, so a session does not overtake one that has waited", async () => {
    const first = await queue("corpus-select");
    await queue("clarify");
    await tick(deps());
    expect((await findQueueEntry(harness.db, first))?.status).toBe("done");
  });
});

describe("two workers cannot run one row", () => {
  test("the second claim takes a different row, or none", async () => {
    // `FOR UPDATE SKIP LOCKED` plus the conditional update. Without it two
    // workers polling the same table read the same oldest row and one wastes a
    // round trip losing the claim — or worse, both run it.
    await queue("corpus-select");
    const mine = await claimNext(harness.db, "worker-a");
    const theirs = await claimNext(harness.other, "worker-b");
    expect(mine).toBeDefined();
    expect(theirs).toBeUndefined();
  });

  test("a row already claimed is not claimed again", async () => {
    await queue("corpus-select");
    await claimNext(harness.db, "worker-a");
    expect(await tick(deps())).toBe("idle");
  });
});

describe("a stage that throws does not stop the worker", () => {
  test("the row is failed and re-enqueued, and the next tick continues", async () => {
    const id = await queue("corpus-select");
    const throwing: StageBody = () => {
      throw new AuteurError("provider_error", "The gateway refused.");
    };

    expect(await tick(deps(throwing))).toBe("ran");
    expect((await findQueueEntry(harness.db, id))?.status).toBe("error");
    const rows = await listQueueForSession(harness.db, sessionId);
    expect(
      rows.some((row) => row.status === "queued" && row.attempt === 1),
    ).toBe(true);

    const events = await readSince(harness.db, sessionId, 0);
    expect(events.some((event) => event.event.type === "stage_error")).toBe(
      true,
    );
  });

  test("a tick that throws is logged and the loop survives it", async () => {
    // The database is briefly unreachable, Neon fails over, a claim races. A
    // worker that exited on the first of those would have to be restarted by
    // the platform, and every session in flight would wait for that.
    const lines: string[] = [];
    let ticks = 0;
    const worker = startWorker({
      ...deps(),
      claimant: () => {
        ticks += 1;
        if (ticks === 1) throw new Error("connection terminated");
        return newId();
      },
      idleMs: 0,
      logger: { ...silent, error: (message: string) => lines.push(message) },
      sleep: async () => undefined,
    });
    // Let a few ticks run, then stop and see it kept going past the throw.
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    await worker.stop();
    expect(lines).toContain("a tick failed");
    expect(ticks).toBeGreaterThan(1);
  });
});

describe("stopping waits for the stage in flight", () => {
  test("stop resolves only after the running stage has finished", async () => {
    // Fly sends SIGTERM on every deploy. A worker that exited immediately would
    // leave a row claimed by a process that no longer exists, and nothing would
    // touch it until the stale threshold — ten minutes of spinner for a deploy
    // that took four seconds.
    const id = await queue("corpus-select");
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const worker = startWorker({
      ...deps(async () => {
        await held;
        return undefined;
      }),
      idleMs: 0,
      sleep: async () => undefined,
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    const stopping = worker.stop();
    // Still claimed: the stage is mid-flight and `stop` has not resolved.
    expect((await findQueueEntry(harness.db, id))?.status).toBe("claimed");
    release?.();
    await stopping;
    expect((await findQueueEntry(harness.db, id))?.status).toBe("done");
  });
});

describe("a claim from a worker that died is released", () => {
  test("a stale claim goes back on the queue and is then run", async () => {
    const id = await queue("corpus-select");
    await claimNext(harness.db, "a-worker-that-died");
    await harness.db.query(
      `UPDATE stage_queue SET claimed_at = now() - interval '1 hour' WHERE id = $1`,
      [id],
    );

    expect(await tick(deps())).toBe("ran");
    expect((await findQueueEntry(harness.db, id))?.status).toBe("done");
  });

  test("a claim younger than the threshold is left alone", async () => {
    // Releasing a claim from a stage that is still working means running it
    // twice — which is why the threshold is ten minutes rather than the
    // invocation ceiling it used to be derived from.
    const id = await queue("corpus-select");
    await claimNext(harness.db, "a-worker-still-working");
    expect(await tick(deps())).toBe("idle");
    expect((await findQueueEntry(harness.db, id))?.status).toBe("claimed");
  });
});
