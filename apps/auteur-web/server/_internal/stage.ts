import { parseBody } from "@auteur/api-contract/contract";
import { ROUTES } from "@auteur/api-contract/routes";
import type { Db } from "@auteur/db/db";
import { AuteurError } from "@auteur/errors/auteur-error";
import { newId } from "@auteur/ids/new-id";
import type { Logger } from "@auteur/logger/logger";
import { claimStage } from "@auteur/stage-queue/queue";
import { Hono } from "hono";
import type { AdvanceDeps } from "../_routes/advance.ts";
import { runClaimedStage, type StageBody, successorsOf } from "./run-stage.ts";
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
 * Re-exported so nothing that imported them from here has to move.
 *
 * Both now live in `run-stage.ts`, with the logic the worker and this route
 * share.
 */
export type { StageBody };
export { successorsOf };

export type InternalStageDeps = {
  readonly db: Db;
  /**
   * The handle events are appended on.
   *
   * `append` wraps its insert and its `NOTIFY` in a transaction, because
   * Postgres holds notifications until commit and a subscriber must not be woken
   * for a row that has not landed. A pooled handle refuses a transaction (§3.1),
   * so this is the direct one on the deployment and `db` in a test.
   */
  readonly eventDb: Db;
  readonly stageSecret: string;
  readonly runStageBody: StageBody;
  readonly invokeStage?: AdvanceDeps["invokeStage"];
  /** Identifies this invocation in `stage_queue.claimed_by`. */
  readonly claimant?: () => string;
  /**
   * Where a stage's failure is recorded in full.
   *
   * The route catches and answers 200 — a failed stage is an outcome, not a
   * failed request — so `app.onError` never sees it and nothing else logs it
   * either. Without this the only trace of a failure anywhere is the
   * `stage_error` event, whose message is written for a reader.
   */
  readonly logger?: Logger;
};

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

    // `JSON.parse` throws a `SyntaxError`, which is not in the taxonomy and so
    // reaches `app.onError` as an unexpected failure: a malformed body from a
    // caller was answered `500 internal`, reporting a client's bug as a
    // server's. Every other bad input on this route is a 400.
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch (cause) {
      throw new AuteurError(
        "invalid_input",
        "This request's body is not JSON.",
        { cause },
      );
    }
    const body = parseBody("internalStage", payload);
    const claimant = claimantOf();
    const claimed = await claimStage(db, body.queueId, claimant);
    if (claimed === undefined) {
      // Someone else has it — the worker, or a sweep racing this invocation.
      // Not an error: it is the ordinary outcome of a conditional claim, and it
      // is what makes two things draining one queue safe.
      return context.json({ claimed: false, enqueued: [] });
    }

    const { enqueued, outcome } = await runClaimedStage(
      {
        db,
        eventDb: deps.eventDb,
        runStageBody: deps.runStageBody,
        ...(deps.invokeStage !== undefined && {
          invokeStage: deps.invokeStage,
        }),
        ...(deps.logger !== undefined && { logger: deps.logger }),
      },
      {
        claimant,
        queueId: body.queueId,
        sessionId: body.sessionId,
        stageId: body.stageId,
      },
    );
    return context.json({ claimed: true, enqueued, outcome });
  });

  return routes;
};
