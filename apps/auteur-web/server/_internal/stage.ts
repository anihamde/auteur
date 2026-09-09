import { parseBody } from "@auteur/api-contract/contract";
import { ROUTES } from "@auteur/api-contract/routes";
import { DEFAULT_PIPELINE } from "@auteur/config/stages";
import type { SessionEvent } from "@auteur/core/events";
import type { Db } from "@auteur/db/db";
import { AuteurError } from "@auteur/errors/auteur-error";
import { isAuteurError } from "@auteur/errors/is-auteur-error";
import { append } from "@auteur/event-store/events";
import { newId } from "@auteur/ids/new-id";
import { recordStageKey } from "@auteur/session-store/stage-keys";
import {
  claimStage,
  completeStage,
  enqueueStage,
  failStage,
} from "@auteur/stage-queue/queue";
import { Hono } from "hono";
import type { AdvanceDeps } from "../_routes/advance.ts";
import { stalenessInputFor } from "../_routes/advance.ts";
import { inputKeys } from "../_staleness.ts";
import { requireSignature, SIGNATURE_HEADER } from "./signature.ts";

/**
 * `POST /internal/stage` — claim one row, run one stage, enqueue the next.
 *
 * There is no loop here and there must not be one. The chain is `stage_queue`'s
 * (§5.3): this invocation runs exactly one stage and asks the platform to run
 * the next, so a lost invocation costs one stage rather than the rest of the
 * run, and the cron sweep re-invokes what was lost.
 *
 * **Claiming is the whole concurrency story.** `claimStage` is a conditional
 * update — `UPDATE ... WHERE status = 'queued' RETURNING` — so a sweep racing a
 * live invocation cannot double-run a stage: the loser's `RETURNING` is empty
 * and it returns `claimed: false` without touching anything.
 */

/**
 * What actually runs a stage. Injected, so this route's mechanics are testable
 * without a model provider and without the network.
 *
 * It returns whatever the stage produced that is not a document — stored
 * beside the key in the same statement, per decision 0007. A stage that writes
 * to its own table returns `undefined`, and that is a real answer rather than
 * an omission.
 */
export type StageBody = (input: {
  readonly db: Db;
  readonly sessionId: string;
  readonly stageId: string;
  readonly emit: (event: SessionEvent) => Promise<void>;
}) => Promise<unknown>;

export type InternalStageDeps = {
  readonly db: Db;
  readonly stageSecret: string;
  readonly runStageBody: StageBody;
  readonly invokeStage?: AdvanceDeps["invokeStage"];
  /** Identifies this invocation in `stage_queue.claimed_by`. */
  readonly claimant?: () => string;
};

/** The stages the pipeline would run after this one, in graph order. */
export const successorsOf = (stageId: string): string[] =>
  DEFAULT_PIPELINE.stages
    .filter((stage) => stage.reads.includes(stageId))
    .map((stage) => stage.id);

export const internalStageRoutes = (deps: InternalStageDeps): Hono => {
  const routes = new Hono();
  const { db } = deps;
  const claimantOf = deps.claimant ?? (() => newId());

  routes.post(ROUTES.internalStage.path, async (context) => {
    // The raw bytes, verified before anything is parsed and before any row is
    // written. A signature over a re-serialized object verifies a different
    // string than the one that was signed.
    const raw = await context.req.text();
    requireSignature(
      deps.stageSecret,
      raw,
      context.req.header(SIGNATURE_HEADER),
    );

    const body = parseBody("internalStage", JSON.parse(raw));
    const claimant = claimantOf();
    const claimed = await claimStage(db, body.queueId, claimant);
    if (claimed === undefined) {
      // Someone else has it. Not an error: this is the ordinary outcome of a
      // sweep racing a live invocation, and it is what makes the sweep safe.
      return context.json({ claimed: false, enqueued: [] });
    }

    const emit = async (event: SessionEvent): Promise<void> => {
      // Appended before it is pushed (§7.3): the table is the truth and the
      // stream is a convenience.
      await append(db, body.sessionId, event);
    };

    let output: unknown;
    try {
      output = await deps.runStageBody({
        db,
        emit,
        sessionId: body.sessionId,
        stageId: body.stageId,
      });
    } catch (thrown) {
      const error = isAuteurError(thrown)
        ? thrown
        : new AuteurError("internal", "The stage failed.");
      await emit({
        code: error.code,
        message: error.message,
        stageId: body.stageId,
        type: "stage_error",
      });
      // The row becomes `error` with the attempt recorded, and is re-enqueued
      // at attempt + 1 under the budget. Never left `claimed` for ever, which
      // is the state the sweep cannot distinguish from a stage still running.
      await failStage(db, body.queueId, claimant, newId());
      return context.json({ claimed: true, enqueued: [] });
    }

    // The key is recorded in the same breath as the completion, so a stage
    // whose output was written and whose key was not cannot exist — that state
    // presents as a stage that re-runs for ever.
    const keys = inputKeys(await stalenessInputFor(db, body.sessionId));
    const key = keys.get(body.stageId);
    if (key !== undefined) {
      await recordStageKey(db, body.sessionId, body.stageId, key, output);
    }
    await completeStage(db, body.queueId, claimant);

    const next = successorsOf(body.stageId);
    const rows = next.map((stageId) => ({
      id: newId(),
      sessionId: body.sessionId,
      stageId,
    }));
    for (const row of rows) {
      await enqueueStage(db, row);
    }
    const first = rows[0];
    if (first !== undefined) {
      await deps.invokeStage?.({
        queueId: first.id,
        sessionId: body.sessionId,
        stageId: first.stageId,
      });
    }

    return context.json({ claimed: true, enqueued: next });
  });

  return routes;
};
