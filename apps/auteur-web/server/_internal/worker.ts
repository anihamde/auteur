import { newId } from "@auteur/ids/new-id";
import type { Logger } from "@auteur/logger/logger";
import { claimNext } from "@auteur/stage-queue/claim-next";
import { findStaleClaims, releaseStaleClaim } from "@auteur/stage-queue/sweep";
import { type RunStageDeps, runClaimedStage } from "./run-stage.ts";

/**
 * The loop that drains `stage_queue`.
 *
 * `stage_queue` was a queue in name and a workaround in fact: a serverless
 * function cannot sit and watch a table, so the deployment invoked *itself*
 * over HTTP to start each stage — with an HMAC so the call could not be forged,
 * a `waitUntil` to keep the caller alive long enough to send it, a bypass
 * header to get past the platform's own login wall, and a sweep to re-invoke
 * whatever was lost. Every one of those exists because of the sixty-second
 * ceiling on an invocation, and none of them is about the pipeline.
 *
 * A worker can watch the table. It claims the oldest queued row, runs it, and
 * claims the next — and a stage may take as long as it takes, which is the
 * whole reason this exists: `style-fields` and `style-extract` each need more
 * than a minute on a real corpus and no arrangement of serverless functions
 * changes that.
 *
 * **It does not replace the route.** `POST /api/internal/stage` still claims a
 * row by id and runs it, which is what makes a stage runnable by hand — the way
 * every stage in this product was first run. Both go through `claimStage`'s
 * conditional update, so a worker and a person with curl cannot run the same
 * row twice.
 */

export type WorkerDeps = Omit<RunStageDeps, "invokeStage"> & {
  readonly logger: Logger;
  /** How long to wait after finding nothing. Milliseconds. */
  readonly idleMs?: number;
  /**
   * How long a claim may sit before this worker treats it as lost.
   *
   * Not the invocation ceiling any more — nothing here is bounded by one — so
   * it is a bound on how long a stage may *legitimately* run. Above the slowest
   * stage by a wide margin, because releasing a claim from a stage that is
   * still working means running it twice.
   */
  readonly staleAfterSeconds?: number;
  /** Identifies this worker in `stage_queue.claimed_by`. */
  readonly claimant?: () => string;
  readonly sleep?: (ms: number) => Promise<void>;
};

export const IDLE_MS = 2_000;

/**
 * Ten minutes, and the number is a judgement about stages rather than a limit.
 *
 * On the serverless path this was derived from `maxDuration`, because nothing
 * could hold a claim longer than the platform allowed. Here nothing stops a
 * stage running for as long as it needs, so the threshold answers a different
 * question: how long before a claim is evidence of a worker that died rather
 * than one that is working. Too low and a live stage is run twice; too high and
 * a crashed one waits. Ten minutes is far above the slowest stage measured
 * (about forty-five seconds) and far below a reader's patience.
 */
export const STALE_AFTER_SECONDS = 600;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * One tick: release what is lost, then run one stage if there is one.
 *
 * Exported so a test can drive the loop one tick at a time. A test that had to
 * start the loop and stop it would be a test of the stopping.
 */
export const tick = async (deps: WorkerDeps): Promise<"ran" | "idle"> => {
  const staleAfter = deps.staleAfterSeconds ?? STALE_AFTER_SECONDS;
  for (const stale of await findStaleClaims(deps.db, staleAfter)) {
    if (await releaseStaleClaim(deps.db, stale.id, staleAfter)) {
      deps.logger.warn("released a stale claim", {
        attempt: stale.attempt,
        sessionId: stale.sessionId,
        stageId: stale.stageId,
      });
    }
  }

  const claimant = (deps.claimant ?? newId)();
  const claimed = await claimNext(deps.db, claimant);
  if (claimed === undefined) {
    return "idle";
  }

  deps.logger.info("running a stage", {
    attempt: claimed.attempt,
    sessionId: claimed.sessionId,
    stageId: claimed.stageId,
  });
  const started = Date.now();
  // No `invokeStage`: the successors this enqueues are claimed on the next
  // tick. Asking anything to run them would be the serverless arrangement
  // again, and there is no instance here that needs waking.
  const { enqueued, outcome } = await runClaimedStage(
    {
      db: deps.db,
      eventDb: deps.eventDb,
      logger: deps.logger,
      runStageBody: deps.runStageBody,
    },
    {
      claimant,
      queueId: claimed.id,
      sessionId: claimed.sessionId,
      stageId: claimed.stageId,
    },
  );
  deps.logger.info("stage finished", {
    enqueued,
    outcome,
    seconds: (Date.now() - started) / 1000,
    stageId: claimed.stageId,
  });
  return "ran";
};

export type Worker = {
  /** Resolves when the loop has stopped and the running stage has finished. */
  readonly stop: () => Promise<void>;
};

/**
 * Run until stopped.
 *
 * **A tick that throws does not stop the loop.** The database is briefly
 * unreachable, a claim races, Neon fails over: a worker that exited on the
 * first of those would have to be restarted by the platform, and every session
 * in flight would wait for that. It logs and waits out the idle interval, which
 * is also the backoff.
 *
 * `stop()` resolves after the tick in flight, so a deploy that sends SIGTERM
 * does not leave a stage half-run with its row still `claimed`.
 */
export const startWorker = (deps: WorkerDeps): Worker => {
  const idle = deps.idleMs ?? IDLE_MS;
  const sleep = deps.sleep ?? wait;
  let running = true;
  const finished = (async () => {
    while (running) {
      try {
        if ((await tick(deps)) === "ran") continue;
      } catch (thrown) {
        deps.logger.error("a tick failed", {
          message:
            thrown instanceof Error ? thrown.message : "non-error thrown",
        });
      }
      if (running) await sleep(idle);
    }
  })();
  return {
    stop: async () => {
      running = false;
      await finished;
    },
  };
};
