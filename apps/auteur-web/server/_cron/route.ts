import { ROUTES } from "@auteur/api-contract/routes";
import type { Db } from "@auteur/db/db";
import { AuteurError } from "@auteur/errors/auteur-error";
import { Hono } from "hono";
import type { AdvanceDeps } from "../_routes/advance.ts";
import { type SweepDeps, sweep } from "./sweep.ts";

/**
 * `/api/internal/cron/sweep` — the one-minute sweep, as a route.
 *
 * `vercel.json`'s cron entry names a path, and a path has to be answerable.
 * Without this the schedule fires into a 404 every minute and every lost stage
 * invocation stays lost — the failure the sweep exists for, with the sweep
 * written and unreachable.
 *
 * **GET as well as POST, and a bearer rather than a signature.** The platform's
 * scheduler invokes a path with GET and presents
 * `Authorization: Bearer <CRON_SECRET>`; it does not sign a body, so the HMAC
 * `/api/internal/stage` uses is not something it can produce. A route that
 * insisted on the signature would never be called at all, and nothing would
 * report that — the schedule would run, get a 401, and count it as a delivery.
 *
 * POST is kept because it is what a person re-running the sweep by hand
 * reaches for, and because the contract's method has to be one of them.
 */
export type CronRoutesDeps = {
  readonly db: Db;
  /** The handle `append` runs on. See `SweepDeps`. */
  readonly eventDb: Db;
  readonly invokeStage: NonNullable<AdvanceDeps["invokeStage"]>;
  /** Vercel's `CRON_SECRET`, read under that exact name. */
  readonly cronSecret: string;
  readonly thresholds?: Pick<
    SweepDeps,
    "queuedAfterSeconds" | "staleAfterSeconds"
  >;
};

/**
 * Compare without leaking the position of the first difference.
 *
 * The same treatment the API token gets in `_app.ts`. A scheduler's token is
 * presented every minute, for ever, which is the shape of thing a timing
 * attack has budget for.
 */
const constantTimeEqual = (left: string, right: string): boolean => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

export const cronRoutes = (deps: CronRoutesDeps): Hono => {
  const routes = new Hono();

  const run = async (presented: string | undefined) => {
    const token = presented?.startsWith("Bearer ")
      ? presented.slice(7)
      : undefined;
    if (token === undefined || !constantTimeEqual(token, deps.cronSecret)) {
      throw new AuteurError(
        "unauthorized",
        "This request does not carry the scheduler's token.",
      );
    }
    return sweep({
      db: deps.db,
      eventDb: deps.eventDb,
      invokeStage: deps.invokeStage,
      ...deps.thresholds,
    });
  };

  routes.get(ROUTES.internalSweep.path, async (context) =>
    context.json(await run(context.req.header("authorization"))),
  );
  routes.post(ROUTES.internalSweep.path, async (context) =>
    context.json(await run(context.req.header("authorization"))),
  );

  return routes;
};
