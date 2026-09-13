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
import { successorsWithin } from "../_graph.ts";
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

export const runClaimedStage = async (
  deps: RunStageDeps,
  claimed: ClaimedStage,
): Promise<StageOutcome> => {
  const { db } = deps;
  const startedAt = Date.now();
  // Whether the body already said the stage ended. A stage that runs a model
  // does — `runStage` emits it with the usage and the cost — and a
  // deterministic one does not.
  let ended = false;
  const emit = async (event: SessionEvent): Promise<void> => {
    if (event.type === "stage_end") ended = true;
    // Appended before it is pushed (§7.3): the table is the truth and the
    // stream is a convenience.
    await append(deps.eventDb, claimed.sessionId, event);
  };

  // The boundary between one run of a stage and the next.
  //
  // `stage_delta` carries a stage id and no run identity, so a screen joining
  // the deltas for `story` joined every run of it: after one rewrite the reader
  // saw the first story immediately followed by the second. This is the marker
  // that separates them, and it is emitted here rather than in a stage body so
  // that every stage has one.
  const stage = DEFAULT_PIPELINE.stages.find(
    (candidate) => candidate.id === claimed.stageId,
  );
  if (stage !== undefined) {
    await emit({
      role: stage.role,
      stageId: claimed.stageId,
      ...(stage.tier !== undefined && { tier: stage.tier }),
      type: "stage_start",
    });
  }

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

  // Exactly one `stage_end` per run, whether or not the body ran a model. It
  // is what the client refetches the session on, and `style-fit` — the last
  // stage before the result screen — runs no model and emitted none, so the
  // report arrived in the database and never on the screen.
  if (!ended) {
    await emit({
      elapsedMs: Date.now() - startedAt,
      stageId: claimed.stageId,
      type: "stage_end",
    });
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
