import { parseBody } from "@auteur/api-contract/contract";
import { ROUTES } from "@auteur/api-contract/routes";
import type { Db } from "@auteur/db/db";
import { Hono } from "hono";
import { requireSignature, SIGNATURE_HEADER } from "../_internal/signature.ts";
import type { AdvanceDeps } from "../_routes/advance.ts";
import { type SweepDeps, sweep } from "./sweep.ts";

/**
 * `POST /internal/cron/sweep` — the one-minute sweep, as a route.
 *
 * `vercel.json`'s cron entry names a path, and a path has to be answerable.
 * Without this the schedule fires into a 404 every minute and every lost stage
 * invocation stays lost — the failure the sweep exists for, with the sweep
 * written and unreachable.
 *
 * Signed with the same stage secret as `/internal/stage`, for the same reason:
 * a caller that can drive the pipeline is a caller that can also release its
 * claims, and neither is something a browser's token should reach.
 */
export type CronRoutesDeps = {
  readonly db: Db;
  readonly invokeStage: NonNullable<AdvanceDeps["invokeStage"]>;
  readonly stageSecret: string;
  readonly thresholds?: Pick<
    SweepDeps,
    "queuedAfterSeconds" | "staleAfterSeconds"
  >;
};

export const cronRoutes = (deps: CronRoutesDeps): Hono => {
  const routes = new Hono();

  routes.post(ROUTES.internalSweep.path, async (context) => {
    const raw = await context.req.text();
    requireSignature(
      deps.stageSecret,
      raw,
      context.req.header(SIGNATURE_HEADER),
    );
    parseBody("internalSweep", raw === "" ? {} : JSON.parse(raw));

    return context.json(
      await sweep({
        db: deps.db,
        invokeStage: deps.invokeStage,
        ...deps.thresholds,
      }),
    );
  });

  return routes;
};
