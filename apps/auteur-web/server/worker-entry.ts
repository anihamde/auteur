import { createDb } from "@auteur/db/db";
import { env } from "@auteur/env/env";
import { createLogger } from "@auteur/logger/logger";
import { createRouterProvider } from "@auteur/provider-router/client";
import { startWorker } from "./_internal/worker.ts";
import { createStageBody } from "./_stages/index.ts";

/**
 * The worker process. Long-lived, and that is the whole point.
 *
 * It runs on Fly rather than beside the routes on Vercel, because a stage may
 * take longer than a serverless invocation is allowed to: `style-fields` and
 * `style-extract` each need more than a minute on a real corpus, measured, and
 * splitting the work made the total worse rather than better. Decision 0032.
 *
 * The division is the queue. Vercel's routes enqueue — choosing an author, or
 * advancing a step — and this drains. Nothing else crosses: both talk to the
 * same Neon database and neither calls the other.
 *
 * This module and `entry.ts` are the only two that read the environment.
 */

const log = createLogger({ bound: { component: "worker" } });

const db = createDb({ endpoint: "pooled", url: env().DATABASE_URL });
// `append` wraps its insert and its NOTIFY in a transaction so a subscriber is
// never woken for a row that has not landed, and a pooled handle refuses a
// transaction (§3.1). The SSE route on Vercel holds its own direct handle for
// `LISTEN`; this one only ever writes.
const eventDb = createDb({
  endpoint: "direct",
  url: env().DATABASE_URL_DIRECT,
});

const worker = startWorker({
  db,
  eventDb,
  logger: log,
  runStageBody: createStageBody({
    provider: createRouterProvider({ apiKey: env().RAMP_ROUTER_API_KEY }),
  }),
});

log.info("worker started", {});

/**
 * Finish the stage in flight, then exit.
 *
 * Fly sends SIGINT and then SIGTERM on a deploy or a restart. A worker that
 * exited immediately would leave a row `claimed` by a process that no longer
 * exists, and nothing would touch it until the stale-claim threshold — ten
 * minutes of a reader watching a spinner for a deploy that took four seconds.
 */
const shutdown = (signal: string) => {
  log.info("stopping", { signal });
  void worker.stop().then(() => {
    void Promise.all([db.close(), eventDb.close()]).then(() => {
      process.exit(0);
    });
  });
};

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
