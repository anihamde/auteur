import { type RouteName, specOf } from "@auteur/api-contract/routes";
import type { CorpusProvider } from "@auteur/corpus-gutenberg/provider";
import type { Db } from "@auteur/db/db";
import { AuteurError } from "@auteur/errors/auteur-error";
import { toHttpResponse } from "@auteur/errors/to-http-response";
import type { Logger } from "@auteur/logger/logger";
import { ensureSchema } from "@auteur/migrations/ensure-schema";
import { Hono } from "hono";
import { sweepOnTraffic } from "./_cron/on-traffic.ts";
import { type CronRoutesDeps, cronRoutes } from "./_cron/route.ts";
import {
  type InternalStageDeps,
  internalStageRoutes,
} from "./_internal/stage.ts";
import { type AdvanceDeps, advanceRoutes } from "./_routes/advance.ts";
import { answerRoutes } from "./_routes/answers.ts";
import { authorRoutes } from "./_routes/authors.ts";
import { cancelRoutes } from "./_routes/cancel.ts";
import { type EventRoutesDeps, eventRoutes } from "./_routes/events.ts";
import { exportRoutes } from "./_routes/export.ts";
import { healthRoutes } from "./_routes/health.ts";
import { modelRoutes } from "./_routes/models.ts";
import { pinRoutes } from "./_routes/pins.ts";
import { type RegenerateDeps, regenerateRoutes } from "./_routes/regenerate.ts";
import { sessionRoutes } from "./_routes/sessions.ts";

/**
 * The one Hono app. Every route is mounted here and nowhere else.
 *
 * Its dependencies are arguments rather than module-level singletons: a route
 * test constructs an app over a test database and a fixed clock, and never
 * touches `env()`. The entry point under `api/` is the only place that reads
 * the environment, which is also what keeps `env()` out of the unit tests of
 * routes that never open a connection.
 */
export type AppDeps = {
  readonly db: Db;
  /** Every `/api` route but `health` requires this as a bearer token. */
  readonly apiToken: string;
  readonly logger?: Logger;
  /**
   * Corpus providers for `GET /api/authors`. Injected so a route test runs
   * offline against a fixture; the default is the one provider that exists.
   */
  readonly providers?: readonly CorpusProvider[];
  /** Asks the platform to run a stage now. See `_routes/advance.ts`. */
  readonly invokeStage?: AdvanceDeps["invokeStage"];
  /** Where a regenerated selection's span is handed on. See `regenerate.ts`. */
  readonly recordSpan?: RegenerateDeps["recordSpan"];
  /**
   * `POST /internal/stage`'s secret and stage body. Absent in a test that does
   * not exercise the pipeline, and the route is then not mounted at all —
   * which is stricter than mounting it with an empty secret.
   */
  readonly internalStage?: Omit<InternalStageDeps, "db" | "invokeStage">;
  /**
   * `/internal/cron/sweep`, and the sweep that traffic drives. Absent in a
   * test that does not sweep, and neither is mounted — the same rule the stage
   * route follows.
   */
  readonly cron?: Omit<CronRoutesDeps, "db"> & {
    /** Overridden by a test that cannot wait for the window to pass. */
    readonly sweepEverySeconds?: number;
  };
  /**
   * Apply outstanding migrations before the first request touches a table.
   *
   * Nobody runs a migration by hand, in any environment, and the platform has
   * no release phase to run one in — so the schema is brought up to date on
   * access, under `ensureSchema`'s lock. Off by default because a route test
   * runs against a database `createTestDb` has already migrated, and doing it
   * twice is a lock acquired for nothing.
   */
  readonly migrateOnBoot?: boolean;
  /**
   * The SSE route's **direct** connection. Absent in a test that does not
   * stream, and the route is then not mounted — which is stricter than mounting
   * it against the pooled handle, where `LISTEN` is accepted and never
   * delivers.
   */
  readonly events?: EventRoutesDeps;
};

/**
 * The routes a request may reach without the bearer token.
 *
 * Health alone, and deliberately: it is what a platform probe calls before any
 * secret is configured, and it answers `{ ok: true }` and nothing else — no
 * version, no database state, no build id. A probe that must authenticate is a
 * probe that reports the token's health rather than the service's.
 */
const UNAUTHENTICATED: readonly RouteName[] = ["health"];

const unauthenticatedPaths = new Set(
  UNAUTHENTICATED.map((name) => specOf(name).path),
);

export const createApp = (deps: AppDeps): Hono => {
  const app = new Hono();

  // One promise, awaited by the first request and shared by every request
  // that arrives during it. A per-request call would serialise a cold start's
  // whole burst behind one lock.
  let migrated: Promise<void> | undefined;

  app.use("*", async (context, next) => {
    if (deps.migrateOnBoot === true) {
      migrated ??= ensureSchema(deps.db);
      await migrated;
    }
    if (
      unauthenticatedPaths.has(context.req.path) ||
      context.req.path.startsWith("/internal/")
    ) {
      // `/internal/stage` carries the stage secret instead, verified by its own
      // handler against the raw body it signs. Two secrets, because a browser
      // holding the client's token must not be able to drive the pipeline.
      return next();
    }
    const header = context.req.header("authorization") ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!constantTimeEqual(presented, deps.apiToken)) {
      // Deliberately not "invalid token" versus "no token": the difference is
      // information about the token, which is the one thing an unauthenticated
      // caller must not learn.
      // Through the same mapping as every other failure, so there is one error
      // shape and one place that decides what a code means.
      const { body, status } = toHttpResponse(
        new AuteurError(
          "unauthorized",
          "This request does not carry the API token.",
        ),
      );
      return context.json(body, status as 401);
    }
    return next();
  });

  if (deps.cron !== undefined) {
    // Before the routes, because a serverless instance may be frozen the
    // moment its response is written — work scheduled for afterwards is work
    // that may never happen.
    //
    // `/api/health` reaches it without a token, and that is deliberate: an
    // idle deployment's only traffic is a platform probe, and the sweep does
    // nothing but re-invoke work that is already overdue. The throttle bounds
    // what an unauthenticated caller can cause to one sweep per window, which
    // is what an authenticated one causes too.
    app.use(
      "*",
      sweepOnTraffic({
        db: deps.db,
        invokeStage: deps.cron.invokeStage,
        onError: (error) => {
          deps.logger?.error("sweep failed", {
            message: error instanceof Error ? error.message : "non-error",
          });
        },
        ...(deps.cron.sweepEverySeconds !== undefined && {
          everySeconds: deps.cron.sweepEverySeconds,
        }),
        ...deps.cron.thresholds,
      }),
    );
  }

  app.onError((thrown, context) => {
    const { body, status } = toHttpResponse(thrown);
    // The mapped body never carries the detail; the log does, against the
    // path, so a 500 is diagnosable without the response saying why.
    deps.logger?.error("request failed", {
      message: thrown instanceof Error ? thrown.message : "non-error thrown",
      method: context.req.method,
      path: context.req.path,
    });
    return context.json(body, status as 400);
  });

  app.notFound((context) =>
    context.json(
      { error: { code: "not_found", message: "There is no such route." } },
      404,
    ),
  );

  app.route(
    "/",
    advanceRoutes({
      db: deps.db,
      ...(deps.invokeStage !== undefined && { invokeStage: deps.invokeStage }),
    }),
  );
  app.route(
    "/",
    authorRoutes({
      db: deps.db,
      ...(deps.providers !== undefined && { providers: deps.providers }),
    }),
  );
  app.route("/", answerRoutes({ db: deps.db }));
  app.route("/", cancelRoutes({ db: deps.db }));
  if (deps.events !== undefined) {
    app.route("/", eventRoutes(deps.events));
  }
  app.route("/", exportRoutes({ db: deps.db }));
  app.route("/", healthRoutes());
  app.route("/", modelRoutes());
  if (deps.cron !== undefined) {
    app.route("/", cronRoutes({ db: deps.db, ...deps.cron }));
  }
  if (deps.internalStage !== undefined) {
    app.route(
      "/",
      internalStageRoutes({
        db: deps.db,
        ...deps.internalStage,
        ...(deps.invokeStage !== undefined && {
          invokeStage: deps.invokeStage,
        }),
      }),
    );
  }
  app.route("/", pinRoutes({ db: deps.db }));
  app.route(
    "/",
    regenerateRoutes({
      db: deps.db,
      ...(deps.invokeStage !== undefined && { invokeStage: deps.invokeStage }),
      ...(deps.recordSpan !== undefined && { recordSpan: deps.recordSpan }),
    }),
  );
  app.route("/", sessionRoutes({ db: deps.db }));

  return app;
};

/**
 * Compare without leaking the position of the first difference.
 *
 * A `===` on a secret is a timing oracle. It is a small one here — a single
 * shared token on a single-user application — but the cost of not having it is
 * zero, and the habit of comparing secrets loosely is the part that does not
 * stay small.
 */
const constantTimeEqual = (left: string, right: string): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};
