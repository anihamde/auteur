import { DEFAULT_PIPELINE } from "@auteur/config/stages";
import type { SessionEvent } from "@auteur/core/events";
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
import { stalenessInputFor } from "../_routes/advance.ts";
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
      // The thrown message, not the mapped one: everything that is not an
      // `AuteurError` becomes the same "The stage failed." sentence, and this
      // is the only place the real one survives.
      message: thrown instanceof Error ? thrown.message : "non-error thrown",
      sessionId: claimed.sessionId,
      stageId: claimed.stageId,
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
  const keys = inputKeys(await stalenessInputFor(db, claimed.sessionId));
  const key = keys.get(claimed.stageId);
  if (key !== undefined) {
    await recordStageKey(db, claimed.sessionId, claimed.stageId, key, output);
  }
  await completeStage(db, claimed.queueId, claimed.claimant);

  const next = successorsOf(claimed.stageId);
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
