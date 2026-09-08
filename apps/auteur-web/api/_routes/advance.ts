import { parseBody } from "@auteur/api-contract/contract";
import { ROUTES } from "@auteur/api-contract/routes";
import { DEFAULT_PIPELINE } from "@auteur/config/stages";
import { TIER_CANDIDATES } from "@auteur/config/tiers";
import type { Step } from "@auteur/core/session";
import type { Db } from "@auteur/db/db";
import { newId } from "@auteur/ids/new-id";
import { resolveAll } from "@auteur/pipeline/resolve-tier";
import { CATALOGUE, toDescriptor } from "@auteur/provider-router/models";
import { readPins } from "@auteur/session-store/pins";
import { answerSetFor } from "@auteur/session-store/questions";
import { requireSession } from "@auteur/session-store/sessions";
import { readStageKeys } from "@auteur/session-store/stage-keys";
import { enqueueStage } from "@auteur/stage-queue/queue";
import { Hono } from "hono";
import { type StalenessInput, staleUpTo } from "../_staleness.ts";
import { idOf } from "./_id.ts";

/**
 * `POST /api/sessions/:id/advance` — run what is stale, and nothing else.
 *
 * §7.1: this is the only route that starts work. It **returns before any stage
 * runs**: it enqueues, asks for the first invocation, and answers. That is what
 * makes the wizard non-blocking (invariant 3) and it is asserted rather than
 * described — the response arrives with every queue row still `queued`.
 *
 * It is also why the route does not compute "what should run next" anywhere
 * else: the queue is the pipeline's control flow, and a second opinion about
 * ordering held in a route would be a second thing to keep correct.
 */

/**
 * The last stage each wizard step needs finished.
 *
 * §3.2's seven steps and §6.2's ten stages are different lists on purpose: a
 * step is a screen and a stage is a unit of work. `idea` and `author` need no
 * stage — reaching them runs nothing, which is why they map to `undefined`
 * rather than to the first stage.
 */
export const LAST_STAGE_FOR_STEP: Readonly<Record<Step, string | undefined>> = {
  author: undefined,
  clarify: "clarify",
  draft: "draft",
  idea: undefined,
  outline: "outline",
  research: "style-extract",
  result: "style-fit",
};

export type AdvanceDeps = {
  readonly db: Db;
  /**
   * Asks the platform to run the stage now. Injected so a route test asserts
   * what was enqueued without a function actually starting; a lost invocation
   * is what the cron sweep exists for, so a no-op here is a supported state of
   * the world rather than a stub of one.
   */
  readonly invokeStage?: (input: {
    readonly sessionId: string;
    readonly stageId: string;
    readonly queueId: string;
  }) => Promise<void>;
};

/**
 * What each stage would run, pins first.
 *
 * A pin is in the input key, so pinning a different model for `outline`
 * restales `outline` onward — the correct and non-obvious answer, because a
 * beat sheet from a different model is a different beat sheet.
 */
export const modelsForStages = (
  pins: ReadonlyMap<string, string>,
): Map<string, string> => {
  const resolved = resolveAll(
    DEFAULT_PIPELINE.stages,
    TIER_CANDIDATES,
    CATALOGUE.map(toDescriptor),
  );
  const models = new Map<string, string>();
  for (const stage of DEFAULT_PIPELINE.stages) {
    const chosen = pins.get(stage.id) ?? resolved.get(stage.id)?.model.id;
    if (chosen !== undefined) {
      models.set(stage.id, chosen);
    }
  }
  return models;
};

/** Everything the staleness computation reads, gathered in one round trip. */
export const stalenessInputFor = async (
  db: Db,
  sessionId: string,
): Promise<StalenessInput> => {
  const [session, answers, pins, completed] = await Promise.all([
    requireSession(db, sessionId),
    answerSetFor(db, sessionId),
    readPins(db, sessionId),
    readStageKeys(db, sessionId),
  ]);
  return {
    answers,
    completed,
    models: modelsForStages(pins),
    pipeline: DEFAULT_PIPELINE,
    session,
  };
};

export const advanceRoutes = (deps: AdvanceDeps): Hono => {
  const routes = new Hono();
  const { db } = deps;

  routes.post(ROUTES.advance.path, async (context) => {
    const id = idOf(context.req.param("id") ?? "");
    const body = parseBody("advance", await context.req.json());
    const input = await stalenessInputFor(db, id);

    const target = LAST_STAGE_FOR_STEP[body.to];
    if (target === undefined) {
      // `idea` and `author` are screens, not work. Answering with an empty list
      // is the honest result; refusing would make the client special-case two
      // of the seven steps.
      return context.json({ enqueued: [] });
    }

    const stale = staleUpTo(input, target);
    if (stale.length === 0) {
      // Re-entering a step and changing nothing restales nothing, which is what
      // makes the design's clickable completed rail rows free.
      return context.json({ enqueued: [] });
    }

    // Every stale stage is enqueued, in graph order, before the first is
    // invoked. Enqueuing only the first would make the chain depend on each
    // stage knowing its successors, and a lost invocation would then lose the
    // rest of the run rather than one step of it.
    const rows = stale.map((stageId) => ({
      id: newId(),
      sessionId: id,
      stageId,
    }));
    for (const row of rows) {
      await enqueueStage(db, row);
    }

    const first = rows[0];
    if (first !== undefined && deps.invokeStage !== undefined) {
      await deps.invokeStage({
        queueId: first.id,
        sessionId: id,
        stageId: first.stageId,
      });
    }

    return context.json({ enqueued: stale });
  });

  return routes;
};
