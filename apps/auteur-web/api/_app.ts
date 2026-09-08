import { type RouteName, specOf } from "@auteur/api-contract/routes";
import type { Db } from "@auteur/db/db";
import { toHttpResponse } from "@auteur/errors/to-http-response";
import type { Logger } from "@auteur/logger/logger";
import { Hono } from "hono";
import { healthRoutes } from "./_routes/health.ts";
import { modelRoutes } from "./_routes/models.ts";
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

  app.use("*", async (context, next) => {
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
      return context.json(
        {
          error: {
            code: "unauthorized",
            message: "This request is not authorised.",
          },
        },
        401,
      );
    }
    return next();
  });

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

  app.route("/", healthRoutes());
  app.route("/", modelRoutes());
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
