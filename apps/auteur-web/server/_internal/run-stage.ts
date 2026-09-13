import { DEFAULT_PIPELINE, STAGE_IDS } from "@auteur/config/stages";
import type { SessionEvent } from "@auteur/core/events";
import type { Step } from "@auteur/core/session";
import type { Db } from "@auteur/db/db";
import { AuteurError } from "@auteur/errors/auteur-error";
import { detailLine } from "@auteur/errors/detail-line";
import { isAuteurError } from "@auteur/errors/is-auteur-error";
import { append } from "@auteur/event-store/events";
import { newId } from "@auteur/ids/new-id";
import type { Logger } from "@auteur/logger/logger";
import { recordStageKey } from "@auteur/session-store/stage-keys";
import {
  completeStage,
  enqueueForRun,
  failStage,
} from "@auteur/stage-queue/queue";
import { LAST_STAGE_FOR_STEP, stalenessInputFor } from "../_routes/advance.ts";
import { inputKeys } from "../_staleness.ts";

/**
 * Running one already-claimed stage: the body, the key, the successors.
 *
 * Extracted from `POST /api/internal/stage` because there are now two callers
 * and only one of them is a route. The worker on Fly claims a row and runs it
 * in-process; the route claims a row named in a request and runs it in a
 * function. What happens between the claim and the successors is identical, and
 * a second copy of it is a second place for "record the key in the same breath
 * as the completion" to stop being true.
 *
 * **It takes a claimed row and never claims one.** Claiming is the whole
 * concurrency story — a conditional update that either takes a row or does not
 * — and it belongs to whoever decided which row to run. `claimStage` takes one
 * by id, `claimNext` takes the oldest; neither is this function's business.
 */

export type StageBody = (input: {
  readonly db: Db;
  readonly sessionId: string;
  readonly stageId: string;
  readonly emit: (event: SessionEvent) => Promise<void>;
}) => Promise<unknown>;

export type RunStageDeps = {
  readonly db: Db;
  /**
   * The handle events are appended on.
   *
   * `append` wraps its insert and its `NOTIFY` in a transaction, because
   * Postgres holds notifications until commit and a subscriber must not be
   * woken for a row that has not landed. A pooled handle refuses a transaction
   * (§3.1), so this is the direct one on the deployment and `db` in a test.
   */
  readonly eventDb: Db;
  readonly runStageBody: StageBody;
  readonly logger?: Logger;
  /**
   * Ask for the next stage to run now.
   *
   * Absent on the worker, which will claim the row it just enqueued on its next
   * tick — there is no instance to keep alive and nothing to ask. Present on
   * the serverless path, where a row nobody invokes waits for the sweep.
   */
  readonly invokeStage?: (input: {
    readonly sessionId: string;
    readonly stageId: string;
    readonly queueId: string;
  }) => Promise<void>;
};

export type ClaimedStage = {
  readonly queueId: string;
  readonly sessionId: string;
  readonly stageId: string;
  readonly claimant: string;
};

export type StageOutcome = {
  readonly outcome: "done" | "error";
  readonly enqueued: readonly string[];
};

/** The stages the pipeline would run after this one, in graph order. */
export const successorsOf = (stageId: string): string[] =>
  DEFAULT_PIPELINE.stages
    .filter((stage) => stage.reads.includes(stageId))
    .map((stage) => stage.id);

/**
 * The successors the session has actually asked for, in graph order.
 *
 * §7.1 says `advance` is the only route that *starts* work, and on the
 * serverless path that was true by accident: a finished stage enqueued its
 * successors, one invocation was asked for, and the rest sat in the queue until
 * the reader pressed a button. The worker drains the queue, so the accident
 * ended — `clarify` wrote its questions and `outline` started in the same
 * second, read an empty answer set, and built the beat sheet from the idea
 * alone. The reader's answers were never read by anything.
 *
 * So the bound is stated rather than inherited, and it is the same bound
 * `enqueueStaleUpTo` uses: nothing past the last stage the current step needs.
 * A step that needs no stage (`idea`, `author`) enqueues nothing at all.
 */
export const successorsWithin = (stageId: string, step: Step): string[] => {
  const limit = LAST_STAGE_FOR_STEP[step];
  if (limit === undefined) return [];
  const bound = STAGE_IDS.indexOf(limit);
  return successorsOf(stageId).filter((id) => {
    const at = STAGE_IDS.indexOf(id);
    return at !== -1 && at <= bound;
  });
};

export const runClaimedStage = async (
  deps: RunStageDeps,
  claimed: ClaimedStage,
): Promise<StageOutcome> => {
  const { db } = deps;
  const emit = async (event: SessionEvent): Promise<void> => {
    // Appended before it is pushed (§7.3): the table is the truth and the
    // stream is a convenience.
    await append(deps.eventDb, claimed.sessionId, event);
  };

  let output: unknown;
  try {
    output = await deps.runStageBody({
      db,
      emit,
      sessionId: claimed.sessionId,
      stageId: claimed.stageId,
    });
  } catch (thrown) {
    const error = isAuteurError(thrown)
      ? thrown
      : new AuteurError("internal", "The stage failed.");
    // The whole of it, structured. `createLogger` redacts by key name at every
    // depth, so a provider body spliced in whole loses its `authorization`
    // without this having to remember to.
    deps.logger?.error("stage failed", {
      code: error.code,
      detail: error.detail,
      sessionId: claimed.sessionId,
      stageId: claimed.stageId,
      // `thrown`, not `message`: the record owns that key and a field of the
      // same name reached the log as `field.message`, which is correct and
      // unreadable. The sentence itself is what matters — everything that is
      // not an `AuteurError` becomes the same "The stage failed.", and this is
      // the only place the real one survives.
      thrown: thrown instanceof Error ? thrown.message : "non-error thrown",
    });
    const detail = detailLine(error);
    await emit({
      code: error.code,
      ...(detail !== undefined && { detail }),
      message: error.message,
      stageId: claimed.stageId,
      type: "stage_error",
    });
    // The row becomes `error` with the attempt recorded, and is re-enqueued at
    // attempt + 1 under the budget. Never left `claimed` for ever, which is the
    // state a sweep cannot distinguish from a stage still running.
    await failStage(db, claimed.queueId, claimed.claimant, newId());
    return { enqueued: [], outcome: "error" };
  }

  // The key is recorded in the same breath as the completion, so a stage whose
  // output was written and whose key was not cannot exist — that state presents
  // as a stage that re-runs for ever.
  const stalenessInput = await stalenessInputFor(db, claimed.sessionId);
  const keys = inputKeys(stalenessInput);
  const key = keys.get(claimed.stageId);
  if (key !== undefined) {
    await recordStageKey(db, claimed.sessionId, claimed.stageId, key, output);
  }
  await completeStage(db, claimed.queueId, claimed.claimant);

  // Read after the body ran, not before: a stage body can be the thing that
  // moves the session on, and the successors that matter are the ones the
  // session wants now.
  const next = successorsWithin(claimed.stageId, stalenessInput.session.step);
  // `enqueueForRun`, not `enqueueStage`: on a second run of a session — a
  // changed author, a regenerate — each successor still carries the finished
  // row from the first, and a plain enqueue collides with it. Without this the
  // chain stops one stage in: this stage re-ran, and the next silently did not.
  const queued = [];
  for (const stageId of next) {
    queued.push(
      await enqueueForRun(db, {
        id: newId(),
        sessionId: claimed.sessionId,
        stageId,
      }),
    );
  }
  const first = queued[0];
  if (first !== undefined) {
    await deps.invokeStage?.({
      queueId: first.id,
      sessionId: claimed.sessionId,
      stageId: first.stageId,
    });
  }

  return { enqueued: next, outcome: "done" };
};
