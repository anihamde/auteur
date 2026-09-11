import { createDb } from "@auteur/db/db";
import { env } from "@auteur/env/env";
import { createLogger } from "@auteur/logger/logger";
import { createRouterProvider } from "@auteur/provider-router/client";
import { createApp } from "./_app.ts";
import { boot } from "./_boot.ts";
import { createStageBody } from "./_stages/index.ts";

/**
 * The one function. Every route arrives here.
 *
 * A catch-all rather than a file per route: the routing is already stated once
 * in `api-contract`, and a second copy of it expressed as filenames is a copy
 * that can disagree.
 *
 * This module and it alone reads the environment. Everything below takes its
 * dependencies as arguments, which is what lets a route test run without a
 * database URL it never uses.
 *
 * Modules under `api/` whose names begin with `_` are not functions; that is
 * why the app, its routers and the stage bodies live under `_app.ts`,
 * `_routes/`, `_internal/` and `_stages/`.
 */

/** One logger, shared by the invocation path and the app. */
const log = createLogger({ bound: { component: "api" } });

/**
 * Nothing here asks for a stage any more.
 *
 * This function used to invoke itself over HTTP to start each one — with an
 * HMAC so the call could not be forged, a `waitUntil` to keep the caller alive
 * long enough to send it, a protection-bypass header to get past the platform's
 * own login wall, and a sweep to re-invoke whatever was lost. All four existed
 * because a serverless invocation may not run for more than sixty seconds, and
 * `style-fields` and `style-extract` each need longer than that on a real
 * corpus.
 *
 * So a worker on Fly drains `stage_queue` instead, and these routes only
 * enqueue. The division is the queue and nothing else crosses it: both processes
 * talk to the same Neon database and neither calls the other.
 *
 * `POST /api/internal/stage` is still mounted and still claims a row by id,
 * because running one stage by hand is how every stage in this product was
 * first run and the signature is what keeps that from being an open door.
 * Nothing calls it automatically.
 */

/**
 * Built inside `boot`, so a missing variable answers with the list of what is
 * missing rather than crashing the function before a route exists.
 */
const app = boot(() => {
  const db = createDb({ endpoint: "pooled", url: env().DATABASE_URL });
  // Two direct handles, not one, and the difference is what each does with a
  // connection. The SSE route **holds** one for the life of a stream, because
  // `LISTEN` is session-level; a transactional write **borrows** one for a few
  // milliseconds. Sharing a pool means the streams starve the writes: four open
  // streams take every connection, and the next `append` waits — until this
  // instance's `maxDuration` kills the stage, with its row still `claimed`.
  //
  // Separate pools bound each by what it is for. A stream that cannot get a
  // connection is one screen that reconnects; a write that cannot is a stage
  // that fails and is retried. Neither is the other's problem now.
  const directDb = createDb({
    endpoint: "direct",
    url: env().DATABASE_URL_DIRECT,
  });
  const streamDb = createDb({
    endpoint: "direct",
    url: env().DATABASE_URL_DIRECT,
  });

  return createApp({
    apiToken: env().AUTEUR_API_TOKEN,
    cron: {
      cronSecret: env().CRON_SECRET,
    },
    db,
    directDb,
    // The one place `LISTEN` gets the connection it needs. §7.
    events: { directDb: streamDb },
    internalStage: {
      runStageBody: createStageBody({
        provider: createRouterProvider({ apiKey: env().RAMP_ROUTER_API_KEY }),
      }),
      stageSecret: env().AUTEUR_STAGE_SECRET,
    },
    logger: log,
    // No release phase on this platform: the schema comes up to date on the
    // first request, under `ensureSchema`'s lock.
    migrateOnBoot: true,
  });
});

export const GET = app.fetch;
export const POST = app.fetch;
export const PATCH = app.fetch;
export const PUT = app.fetch;
export const DELETE = app.fetch;

export default app.fetch;
