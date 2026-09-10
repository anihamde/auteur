import { createDb } from "@auteur/db/db";
import { env } from "@auteur/env/env";
import { createLogger } from "@auteur/logger/logger";
import { createRouterProvider } from "@auteur/provider-router/client";
import { waitUntil } from "@vercel/functions";
import { createApp } from "./_app.ts";
import { boot } from "./_boot.ts";
import { createInvokeStage } from "./_internal/invoke-stage.ts";
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
 * What lets a deployment call itself when the platform is guarding it.
 *
 * Deployment Protection puts an authentication wall in front of a deployment's
 * own hostname — which is the hostname a stage invokes, so with it on, every
 * invocation reaches a login page rather than the route. The platform's answer
 * is a bypass secret it sets in the environment; sending it is what makes a
 * protected deployment able to talk to itself.
 *
 * Absent, this sends nothing: an unprotected deployment needs no header, and a
 * protected one without the secret is a configuration to fix rather than
 * something to work around here.
 */
/**
 * The origin this function answers on.
 *
 * `VERCEL_URL` is the deployment's own host, so an invocation reaches the
 * deployment that made it rather than whatever the production alias points at —
 * a preview must not drive production's pipeline. Absent, this is a local
 * `vite dev`.
 *
 * It was deleted by the change that added the bypass header below, and nothing
 * noticed: `apps/auteur-web/tsconfig.json` still named the `api/` directory
 * this one replaced, so no typecheck ever read this file. Every invocation
 * threw `selfOrigin is not defined` before it reached `fetch`, which the
 * `void`ed promise then swallowed — so the queue filled, the sweep re-invoked
 * into the same throw, and nothing anywhere said why.
 */
const selfOrigin = (): string => {
  const host = process.env["VERCEL_URL"];
  // Empty is unset, the same reading `protectionBypass` takes below. `https://`
  // with no host is a url that parses and reaches nothing.
  return host === undefined || host === ""
    ? "http://127.0.0.1:3000"
    : `https://${host}`;
};

const protectionBypass = (): Record<string, string> => {
  const secret = process.env["VERCEL_AUTOMATION_BYPASS_SECRET"];
  return secret === undefined || secret === ""
    ? {}
    : {
        "x-vercel-protection-bypass": secret,
        "x-vercel-set-bypass-cookie": "false",
      };
};

/**
 * Built inside `boot`, so a missing variable answers with the list of what is
 * missing rather than crashing the function before a route exists.
 */
/**
 * The invocation, wired to the platform.
 *
 * `waitUntil` is what keeps this instance alive until the request is actually
 * sent. Without it the promise was dropped and the instance froze with the
 * response, so no stage was ever started by anything but a person with curl.
 */
const invokeStage = createInvokeStage({
  extraHeaders: protectionBypass,
  logger: log,
  origin: selfOrigin,
  stageSecret: () => env().AUTEUR_STAGE_SECRET,
  waitUntil,
});

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
      invokeStage,
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
    invokeStage,
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
