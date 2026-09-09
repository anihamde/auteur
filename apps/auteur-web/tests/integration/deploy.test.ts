import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { pathFor } from "@auteur/api-contract/contract";
import { ROUTE_NAMES, specOf } from "@auteur/api-contract/routes";
import { newId } from "@auteur/ids/new-id";
import { createSession } from "@auteur/session-store/sessions";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
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
  app = createApp({
    apiToken: TOKEN,
    db: harness.db,
    internalStage: {
      runStageBody: async () => undefined,
      stageSecret: SECRET,
    },
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
  test("the cron entry names the sweep and no other route", async () => {
    const config = (await Bun.file(
      `${import.meta.dir}/../../vercel.json`,
    ).json()) as {
      crons: { path: string; schedule: string }[];
      rewrites?: unknown;
    };
    expect(config.crons).toHaveLength(1);
    // The contract's path, not a substring of it. There are no rewrites: every
    // route is a real `/api/...` path, so the platform's own file-system
    // routing delivers it to the catch-all with the path intact. A rewrite
    // would hand the function the *destination* path, and the app routes on
    // what it is given.
    expect(config.crons[0]?.path).toBe(specOf("internalSweep").path);
    expect(config.rewrites).toBeUndefined();
    // Daily, and that is not the sweep's interval. The plan this deploys on
    // allows one firing a day, so the schedule is a backstop for an idle
    // deployment; traffic drives the sweep at §5.3's frequency. A minute-level
    // expression here is rejected at build time by the platform, which is a
    // deploy that fails rather than a sweep that runs.
    expect(config.crons[0]?.schedule).not.toContain("*/");
    expect(config.crons[0]?.schedule?.startsWith("* ")).toBe(false);
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
