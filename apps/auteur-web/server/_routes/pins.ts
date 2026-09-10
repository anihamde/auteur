import { parseBody } from "@auteur/api-contract/contract";
import { ROUTES } from "@auteur/api-contract/routes";
import { DEFAULT_PIPELINE } from "@auteur/config/stages";
import type { Db } from "@auteur/db/db";
import { AuteurError } from "@auteur/errors/auteur-error";
import { validatePin } from "@auteur/pipeline/pins";
import { CATALOGUE, toDescriptor } from "@auteur/provider-router/models";
import { putPins, readPins } from "@auteur/session-store/pins";
import { requireSession } from "@auteur/session-store/sessions";
import { Hono } from "hono";
import { idOf } from "./_id.ts";

/**
 * `PUT /api/sessions/:id/pins` — the whole pin set, validated per stage.
 *
 * §6.3's "use one model for every stage" writes seven at once, which is why
 * this is a `PUT` of the set rather than a `POST` per stage: unpinning is then
 * a write of the remaining pins, and there is no second endpoint whose absence
 * anyone has to remember.
 *
 * **The write is all-or-nothing.** A model that cannot emit a strict schema is
 * refused for the six typed stages, and the refusal rejects the request rather
 * than applying the four that were fine — a half-applied set leaves a pipeline
 * running two models the reader never chose together, which is worse than not
 * writing at all because nobody would think to look for it.
 */
/**
 * `writeDb` is the handle `putPins` runs on. It replaces the set in one
 * transaction so a reader cannot see the delete without the insert, and a
 * pooled handle refuses a transaction (§3.1) — so this is the direct one on the
 * deployment and `db` in a test.
 */
export type PinRoutesDeps = {
  readonly db: Db;
  readonly writeDb: Db;
};

export const pinRoutes = (deps: PinRoutesDeps): Hono => {
  const routes = new Hono();
  const { db } = deps;
  const catalogue = CATALOGUE.map(toDescriptor);

  routes.put(ROUTES.pins.path, async (context) => {
    const id = idOf(context.req.param("id") ?? "");
    const body = parseBody("pins", await context.req.json());
    await requireSession(db, id);

    const refused = Object.entries(body.pins)
      .map(([stageId, modelId]) => ({
        stageId,
        verdict: validatePin({
          catalogue,
          pin: { modelId, stageId },
          stages: DEFAULT_PIPELINE.stages,
        }),
      }))
      .filter(
        (
          entry,
        ): entry is {
          stageId: string;
          verdict: { accepted: false; reason: string };
        } => !entry.verdict.accepted,
      )
      .map((entry) => ({
        reason: entry.verdict.reason,
        stageId: entry.stageId,
      }));

    if (refused.length > 0) {
      throw new AuteurError(
        "invalid_input",
        `${refused.length.toString()} of these pins cannot be applied, so none were.`,
        { detail: { refused } },
      );
    }

    await putPins(deps.writeDb, id, new Map(Object.entries(body.pins)));
    return context.json({ pins: Object.fromEntries(await readPins(db, id)) });
  });

  return routes;
};
