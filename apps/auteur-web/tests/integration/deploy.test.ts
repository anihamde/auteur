import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { pathFor } from "@auteur/api-contract/contract";
import { ROUTE_NAMES, specOf } from "@auteur/api-contract/routes";
import { newId } from "@auteur/ids/new-id";
import { createSession } from "@auteur/session-store/sessions";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import { CRONS } from "../../../../scripts/build-vercel.ts";
import { createApp } from "../../server/_app.ts";
import {
  GUARDED_PATHS,
  SIGNED_PATHS,
  UNGUARDED_PATHS,
} from "../../server/_auth.ts";

/**
 * WP-R11's proof, enumerated from the contract rather than spot-checked.
 *
 * A list of routes written by hand is a list a sixteenth route joins without
 * anyone noticing, and the one that joins unguarded is the one that matters.
 */

const TOKEN = "a-token-of-at-least-16-chars";
const SECRET = "a-stage-secret-of-16-plus";
const CRON = "a-cron-secret-of-16-plus";

let harness: TestDb;
let sessionId: string;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  harness = await createTestDb();
  const session = await createSession(harness.db, {
    id: newId(),
    idea: "a lighthouse keeper",
    lengthPreset: "flash",
  });
  sessionId = session.id;
  // Every optional dependency supplied, so every route the contract declares
  // is mounted. An app missing one is an app whose unmounted routes cannot be
  // told apart from unwritten ones.
  app = createApp({
    apiToken: TOKEN,
    cron: { cronSecret: CRON, invokeStage: async () => undefined },
    db: harness.db,
    events: { directDb: harness.other },
    internalStage: {
      runStageBody: async () => undefined,
      stageSecret: SECRET,
    },
    invokeStage: async () => undefined,
  });
});

afterAll(async () => {
  await harness.close();
});

const urlFor = (name: (typeof ROUTE_NAMES)[number]): string =>
  pathFor(name, { id: sessionId });

describe("every public route requires the bearer token", () => {
  test("the guarded list is derived from the contract and covers all but health", () => {
    // Derived from the three lists rather than from a literal, so a route
    // added to the contract has to land in exactly one of them.
    expect(GUARDED_PATHS).toHaveLength(
      ROUTE_NAMES.length - UNGUARDED_PATHS.length - SIGNED_PATHS.length,
    );
    expect(UNGUARDED_PATHS).toEqual(["/api/health"]);
    expect([...SIGNED_PATHS].sort()).toEqual([
      // Temporary; see `_routes/corpus-probe.ts`.
      "/api/internal/corpus-probe",
      "/api/internal/cron/sweep",
      "/api/internal/stage",
    ]);
  });

  test("a request with no token is 401 on every one of them", async () => {
    for (const name of ROUTE_NAMES) {
      const spec = specOf(name);
      if (spec.internal === true || name === "health") continue;
      const response = await app.request(urlFor(name), {
        method: spec.method,
        ...(spec.body === undefined
          ? {}
          : {
              body: "{}",
              headers: { "content-type": "application/json" },
            }),
      });
      expect({ name, status: response.status }).toEqual({
        name,
        status: 401,
      });
    }
  });

  test("every route in the contract has a handler", async () => {
    // The 401 check above passes for a route nobody mounted: the bearer
    // middleware answers before routing, so a contract entry with no handler
    // looks exactly like one that works. `selectAuthor` was declared, called by
    // the author screen, and mounted nowhere — the wizard could not get past
    // step two, and every test here was green.
    //
    // So: with a valid token, no route may answer 404 for "there is no such
    // route". A 404 about the *session* is fine and expected; the two are
    // distinguished by the message the router's own handler uses.
    const missing: string[] = [];
    for (const name of ROUTE_NAMES) {
      const spec = specOf(name);
      if (spec.internal === true) continue;
      const response = await app.request(urlFor(name), {
        headers: {
          authorization: `Bearer ${TOKEN}`,
          ...(spec.body === undefined
            ? {}
            : { "content-type": "application/json" }),
        },
        method: spec.method,
        ...(spec.body === undefined ? {} : { body: "{}" }),
      });
      if (response.status !== 404) continue;
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message === "There is no such route.") {
        missing.push(`${spec.method} ${spec.path}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("health answers without one", async () => {
    expect((await app.request("/api/health")).status).toBe(200);
  });
});

describe("the stage secret and the bearer token are different keys", () => {
  test("/internal/stage rejects a valid bearer token", async () => {
    // A browser holding the client's token must not be able to drive the
    // pipeline directly.
    const response = await app.request("/api/internal/stage", {
      body: JSON.stringify({
        queueId: newId(),
        sessionId,
        stageId: "outline",
      }),
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(response.status).toBe(401);
  });
});

describe("the deploy configuration", () => {
  test("the schedule names the sweep's own path, and says it once", async () => {
    // Declared in the build script, not here: the platform reads `vercel.json`
    // and the generated `config.json` both, and the same entry in each is
    // rejected — "A duplicated cron job with the same schedule and path was
    // found." So `vercel.json` must not carry one.
    //
    // The path is checked against the contract from this side, because the
    // script cannot import the contract: workspace packages are linked into
    // the package that depends on them, never the repository root.
    expect(CRONS).toHaveLength(1);
    expect(specOf("internalSweep").path).toBe(CRONS[0]?.path);

    const config = (await Bun.file(
      `${import.meta.dir}/../../vercel.json`,
    ).json()) as { crons?: unknown; rewrites?: unknown };
    expect(config.crons).toBeUndefined();
    // Nor rewrites: every route is a real `/api/...` path, and a rewrite would
    // hand the function the destination rather than what the caller asked for.
    expect(config.rewrites).toBeUndefined();
  });

  test("the build produces the Build Output API, not a directory to guess at", async () => {
    // `.vercel/output` is the platform's "we produce it" contract: a function
    // we bundled ourselves and the client bundle, laid out as it will be
    // served. Naming an `outputDirectory` as well would be a second statement
    // of what to serve, and the one the platform ignores.
    const config = (await Bun.file(
      `${import.meta.dir}/../../vercel.json`,
    ).json()) as {
      buildCommand: string;
      functions?: unknown;
      outputDirectory?: string;
    };
    expect(config.buildCommand).toContain("build:vercel");
    expect(config.outputDirectory).toBeUndefined();
    // Nor a `functions` entry: there are no source functions to configure, and
    // the duration the platform reads is the one in the generated
    // `.vc-config.json`.
    expect(config.functions).toBeUndefined();
  });
});
