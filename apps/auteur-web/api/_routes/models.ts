import { ROUTES } from "@auteur/api-contract/routes";
import { DEFAULT_PIPELINE } from "@auteur/config/stages";
import { TIER_CANDIDATES } from "@auteur/config/tiers";
import { resolveAll } from "@auteur/pipeline/resolve-tier";
import { CATALOGUE, toDescriptor } from "@auteur/provider-router/models";
import { Hono } from "hono";

/**
 * `GET /api/models` — the catalogue, and what each stage would run.
 *
 * Two lists rather than one joined shape, because §6.3's panel shows two
 * different things: every model the gateway offers, and the stage-to-model
 * assignment resolution currently produces. A stage with no tier is
 * deterministic and runs no model at all — `modelId: null` says so, rather than
 * the stage being absent, which would read as a gap in the pipeline.
 *
 * `pinned` is false on every row here. A pin is per session (§6.3), and this
 * route has no session; the session view carries the pinned assignment.
 */
export const modelRoutes = (): Hono => {
  const routes = new Hono();

  routes.get(ROUTES.models.path, (context) => {
    const catalogue = CATALOGUE.map(toDescriptor);
    // Throws `model_unavailable` if a tiered stage resolves to nothing, which
    // is the honest answer: the panel cannot show an assignment that does not
    // exist, and a route that returned a partial one would have the UI render
    // a pipeline that cannot start.
    const resolved = resolveAll(
      DEFAULT_PIPELINE.stages,
      TIER_CANDIDATES,
      catalogue,
    );

    return context.json({
      models: CATALOGUE.map((row) => ({
        contextWindow: row.contextWindow,
        creator: row.creator,
        displayName: row.displayName,
        id: row.id,
        inputPerMillion: row.pricing.inputPerMillion,
        maxOutputTokens: row.maxOutputTokens,
        structuredOutput: row.structuredOutput,
      })),
      stages: DEFAULT_PIPELINE.stages.map((stage) => ({
        modelId: resolved.get(stage.id)?.model.id ?? null,
        pinned: false,
        role: stage.role,
        stageId: stage.id,
        tier: stage.tier ?? null,
      })),
    });
  });

  return routes;
};
