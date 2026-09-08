import { createDb } from "@auteur/db/db";
import { env } from "@auteur/env/env";
import { createLogger } from "@auteur/logger/logger";
import { createApp } from "./_app.ts";

/**
 * The one function. Every route arrives here.
 *
 * A catch-all rather than a file per route: the routing is already stated once
 * in `api-contract`, and a second copy of it expressed as filenames is a copy
 * that can disagree. `/internal/stage` gets its own function at WP-N7, for the
 * one reason a separate function is worth having — a different `maxDuration`.
 *
 * This module and it alone reads the environment. Everything below takes its
 * dependencies as arguments, which is what lets a route test run without a
 * database URL it never uses.
 *
 * Modules under `api/` whose names begin with `_` are not functions; that is
 * why the app and its routers live under `_app.ts` and `_routes/`.
 */
const app = createApp({
  apiToken: env().AUTEUR_API_TOKEN,
  db: createDb({ endpoint: "pooled", url: env().DATABASE_URL }),
  logger: createLogger({ bound: { component: "api" } }),
});

export const GET = app.fetch;
export const POST = app.fetch;
export const PATCH = app.fetch;
export const PUT = app.fetch;
export const DELETE = app.fetch;

export default app.fetch;
