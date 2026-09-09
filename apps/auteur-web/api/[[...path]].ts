import { pathFor } from "@auteur/api-contract/contract";
import { createDb } from "@auteur/db/db";
import { env } from "@auteur/env/env";
import { createLogger } from "@auteur/logger/logger";
import { createRouterProvider } from "@auteur/provider-router/client";
import { createApp } from "./_app.ts";
import { SIGNATURE_HEADER, signPayload } from "./_internal/signature.ts";
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

/**
 * Ask the platform to run one stage, and do not wait for it.
 *
 * Deliberately fire-and-forget: `advance` must return before any stage runs
 * (§7.1), and a stage's last act is to ask for the next one — awaiting here
 * would rebuild the long-running process the whole topology removed, one
 * `await` at a time.
 *
 * A lost request is not a lost run. The queue row stays `queued` and the
 * one-minute sweep re-invokes it, which is why this can afford to ignore its
 * own failure rather than retry into a stage that may already be running.
 */
const invokeStage = async (input: {
  readonly sessionId: string;
  readonly stageId: string;
  readonly queueId: string;
}): Promise<void> => {
  const body = JSON.stringify({
    queueId: input.queueId,
    sessionId: input.sessionId,
    stageId: input.stageId,
  });
  const url = new URL(pathFor("internalStage", {}), selfOrigin());
  void fetch(url, {
    body,
    headers: {
      "content-type": "application/json",
      [SIGNATURE_HEADER]: signPayload(env().AUTEUR_STAGE_SECRET, body),
    },
    method: "POST",
  }).catch(() => undefined);
};

/**
 * Where this deployment answers itself.
 *
 * Vercel sets `VERCEL_URL` per deployment, so a preview invokes its own stage
 * function rather than production's — which matters more than it sounds: a
 * preview driving production's pipeline would write a preview's stages into
 * production's database.
 */
const selfOrigin = (): string => {
  const host = process.env["VERCEL_URL"];
  return host === undefined ? "http://127.0.0.1:3000" : `https://${host}`;
};

const db = createDb({ endpoint: "pooled", url: env().DATABASE_URL });

const app = createApp({
  apiToken: env().AUTEUR_API_TOKEN,
  cron: {
    cronSecret: env().CRON_SECRET,
    invokeStage,
  },
  db,
  // The one place `LISTEN` gets the connection it needs. §7.
  events: {
    directDb: createDb({ endpoint: "direct", url: env().DATABASE_URL_DIRECT }),
  },
  internalStage: {
    runStageBody: createStageBody({
      provider: createRouterProvider({ apiKey: env().RAMP_ROUTER_API_KEY }),
    }),
    stageSecret: env().AUTEUR_STAGE_SECRET,
  },
  invokeStage,
  logger: createLogger({ bound: { component: "api" } }),
  // No release phase on this platform: the schema comes up to date on the
  // first request, under `ensureSchema`'s lock.
  migrateOnBoot: true,
});

export const GET = app.fetch;
export const POST = app.fetch;
export const PATCH = app.fetch;
export const PUT = app.fetch;
export const DELETE = app.fetch;

export default app.fetch;
