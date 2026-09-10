import { parseBody } from "@auteur/api-contract/contract";
import { ROUTES } from "@auteur/api-contract/routes";
import type { Story } from "@auteur/core/session";
import { storySchema } from "@auteur/core/session";
import type { Db } from "@auteur/db/db";
import { AuteurError } from "@auteur/errors/auteur-error";
import { newId } from "@auteur/ids/new-id";
import { findArtifact } from "@auteur/session-store/artifacts";
import { requireSession } from "@auteur/session-store/sessions";
import { enqueueForRun } from "@auteur/stage-queue/queue";
import { snapToSentence } from "@auteur/text/snap";
import { countWords } from "@auteur/text/tokenize";
import { Hono } from "hono";
import { idOf } from "./_id.ts";
import type { AdvanceDeps } from "./advance.ts";

/**
 * `POST /api/sessions/:id/regenerate` — the outline again, or one selection.
 *
 * §6.9: a selection is `revise` with a span instead of findings. Same role,
 * same tier, same model, same prompt package — so this route computes the span
 * and enqueues `revise`, and does not become a second pipeline.
 */

/**
 * The largest share of a story one selection may replace (§6.9).
 *
 * Above it the request is a re-draft, not a regeneration, and the rail already
 * offers re-entering step 6.
 */
export const MAX_SELECTION_SHARE = 0.6;

/**
 * Validate and snap a selection.
 *
 * The order matters: **snap first, then measure.** Snapping widens the span, so
 * measuring the raw selection would let a request through that, once widened,
 * rewrites more than the limit allows — and the value the prompt sees is the
 * snapped one, so the snapped one is what the limit is about.
 */
export const selectionSpan = (
  story: Story,
  selection: { readonly from: number; readonly to: number },
): { readonly from: number; readonly to: number } => {
  if (selection.to <= selection.from) {
    throw new AuteurError(
      "invalid_input",
      "A selection must cover at least one character.",
    );
  }
  const snapped = snapToSentence(story.markdown, selection.from, selection.to);
  const total = countWords(story.markdown);
  const selected = countWords(story.markdown.slice(snapped.from, snapped.to));
  if (total === 0 || selected / total > MAX_SELECTION_SHARE) {
    throw new AuteurError(
      "invalid_input",
      "That selection covers too much of the story to regenerate. Re-enter the draft step instead.",
    );
  }
  return snapped;
};

export type RegenerateDeps = {
  readonly db: Db;
  readonly invokeStage?: AdvanceDeps["invokeStage"];
  /**
   * Where the span is handed to `revise`. Injected so a test asserts what
   * reached the prompt, which is the only place the snapping is observable.
   */
  readonly recordSpan?: (input: {
    readonly sessionId: string;
    readonly from: number;
    readonly to: number;
  }) => Promise<void>;
};

export const regenerateRoutes = (deps: RegenerateDeps): Hono => {
  const routes = new Hono();
  const { db } = deps;

  routes.post(ROUTES.regenerate.path, async (context) => {
    const id = idOf(context.req.param("id") ?? "");
    const body = parseBody("regenerate", await context.req.json());
    await requireSession(db, id);

    const stageId = body.kind === "outline" ? "outline" : "revise";

    if (body.kind === "selection") {
      const stored = await findArtifact(db, id, "draft");
      if (stored === undefined) {
        throw new AuteurError(
          "invalid_input",
          "There is no draft to regenerate a selection of.",
        );
      }
      const span = selectionSpan(storySchema.parse(stored.body), body);
      await deps.recordSpan?.({ from: span.from, sessionId: id, to: span.to });
    }

    // Regenerating is asking a stage that has already run to run again, which
    // a plain enqueue could not do: its finished row holds the attempt-0 key.
    // The id invoked is the returned row's, which on a stage already in flight
    // is the one that exists rather than the one just minted.
    const row = await enqueueForRun(db, {
      id: newId(),
      sessionId: id,
      stageId,
    });
    await deps.invokeStage?.({ queueId: row.id, sessionId: id, stageId });
    return context.json({ enqueued: [stageId] });
  });

  return routes;
};
