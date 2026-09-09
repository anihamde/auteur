import { ROUTES } from "@auteur/api-contract/routes";
import type { Db } from "@auteur/db/db";
import { requestCancel } from "@auteur/event-store/session-runs";
import { requireSession } from "@auteur/session-store/sessions";
import { Hono } from "hono";
import { idOf } from "./_id.ts";

/**
 * `POST /api/sessions/:id/cancel` — set the flag.
 *
 * Cancellation is a flag and not a signal, because there is nothing to signal:
 * the stage is running in another function invocation this one cannot reach.
 * The running stage reads the flag between delta flushes, so the worst-case
 * latency is one flush (§5.3).
 *
 * `cancelling: false` means there was no run to cancel — already finished, or
 * never started. Not an error: a reader pressing cancel as the last stage lands
 * has done nothing wrong, and a 409 would tell them they had.
 */
export const cancelRoutes = (deps: { readonly db: Db }): Hono => {
  const routes = new Hono();

  routes.post(ROUTES.cancel.path, async (context) => {
    const id = idOf(context.req.param("id") ?? "");
    await requireSession(deps.db, id);
    return context.json({ cancelling: await requestCancel(deps.db, id) });
  });

  return routes;
};
