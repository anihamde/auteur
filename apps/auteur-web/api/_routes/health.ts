import { ROUTES } from "@auteur/api-contract/routes";
import { Hono } from "hono";

/**
 * `GET /api/health`.
 *
 * `{ ok: true }` and nothing else. It is the one unauthenticated route
 * (`_app.ts`), so everything it could add — a version, a build id, whether the
 * database answered — is something an unauthenticated caller would learn. A
 * liveness probe does not need any of it: the function answering at all is the
 * fact being probed.
 */
export const healthRoutes = (): Hono => {
  const routes = new Hono();
  routes.get(ROUTES.health.path, (context) => context.json({ ok: true }));
  return routes;
};
