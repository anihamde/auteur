import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { dirname, resolve } from "node:path";
import { ROUTE_NAMES, ROUTES, specOf } from "@auteur/api-contract/routes";
import { newId } from "@auteur/ids/new-id";
import { createSession } from "@auteur/session-store/sessions";
import {
  claimStage,
  enqueueStage,
  findQueueEntry,
} from "@auteur/stage-queue/queue";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import { createApp } from "../../api/_app.ts";

/**
 * The cron path `vercel.json` names must be answerable.
 *
 * Without this the schedule fires into a 404 every minute and every lost stage
 * invocation stays lost — the sweep written, tested and unreachable, which is
 * exactly how it shipped before this suite existed.
 */

const TOKEN = "a-token-of-at-least-16-chars";
const SECRET = "a-stage-secret-of-16-plus";
const CRON = "a-cron-secret-of-16-plus";

let harness: TestDb;
let sessionId: string;
const invoked: string[] = [];

const appWithCron = (): ReturnType<typeof createApp> =>
  createApp({
    apiToken: TOKEN,
    cron: {
      cronSecret: CRON,
      invokeStage: async ({ stageId }) => {
        invoked.push(stageId);
      },
      thresholds: { queuedAfterSeconds: 0, staleAfterSeconds: 0 },
    },
    db: harness.db,
  });

beforeAll(async () => {
  harness = await createTestDb();
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  invoked.length = 0;
  await harness.db.query(`DELETE FROM stage_queue`);
  const session = await createSession(harness.db, {
    id: newId(),
    idea: "a lighthouse keeper",
    lengthPreset: "flash",
  });
  sessionId = session.id;
});

/** How the platform's scheduler calls it: GET, with a bearer token. */
const sweepRequest = async (
  token: string | null = CRON,
  method: "GET" | "POST" = "GET",
): Promise<Response> =>
  appWithCron().request(ROUTES.internalSweep.path, {
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
    method,
  });

describe("the path vercel.json's cron names is answerable", () => {
  test("it is the sweep's path, and it is not a 404", async () => {
    const config = (await Bun.file(
      `${import.meta.dir}/../../vercel.json`,
    ).json()) as { crons: { path: string }[] };
    expect(config.crons[0]?.path).toBe(ROUTES.internalSweep.path);
    expect((await sweepRequest()).status).toBe(200);
  });

  test("a signed sweep re-invokes a row nobody ran", async () => {
    const id = newId();
    await enqueueStage(harness.db, { id, sessionId, stageId: "outline" });
    const body = ROUTES.internalSweep.response.parse(
      await (await sweepRequest()).json(),
    );
    expect(body.reinvoked).toEqual([id]);
    expect(invoked).toEqual(["outline"]);
  });

  test("a lost claim is released for another attempt", async () => {
    const id = newId();
    await enqueueStage(harness.db, { id, sessionId, stageId: "draft" });
    await claimStage(harness.db, id, "the-lost-invocation");
    const body = ROUTES.internalSweep.response.parse(
      await (await sweepRequest()).json(),
    );
    expect(body.released).toEqual([id]);
    expect((await findQueueEntry(harness.db, id))?.status).toBe("queued");
  });
});

describe("the platform has a function to find", () => {
  const appRoot = `${import.meta.dir}/../..`;

  test("the functions glob names a directory holding a catch-all", async () => {
    // The platform builds a function per file in `api/` **at the root of the
    // deployment**, and the deployment root is this app — `vercel.json` lives
    // here, and its build and install commands step up to the workspace root.
    // That is what puts `node_modules` beside the function: workspace packages
    // are linked into the package that depends on them, not into the
    // repository root, so an `api/` directory at the repository root cannot
    // resolve `@auteur/*` at all.
    //
    // Get this wrong and the deploy succeeds, the static site serves, and
    // every route answers 404 — including `/api/health`, which is the thing
    // one checks to decide whether the deploy worked.
    const config = (await Bun.file(`${appRoot}/vercel.json`).json()) as {
      functions: Record<string, unknown>;
    };
    const globs = Object.keys(config.functions);
    expect(globs).toHaveLength(1);
    const directory = globs[0]?.replace(/\/\*\*$/, "");
    expect(
      await Bun.file(`${appRoot}/${directory}/[...path].ts`).exists(),
    ).toBe(true);
  });

  test("every route is under the catch-all's own prefix", () => {
    // `api/[...path].ts` answers `/api/<something>` and nothing else. A route
    // outside that prefix would need a rewrite to reach it, and a rewrite
    // hands the function the *destination* path rather than the requested one
    // — so the app would route on a path the caller never asked for. That is
    // why the internal routes are `/api/internal/...`.
    const outside = ROUTE_NAMES.map((name) => specOf(name).path).filter(
      (path) => !path.startsWith("/api/"),
    );
    expect(outside).toEqual([]);
  });

  test("nothing under api/ imports a file outside it", async () => {
    // A function is deployed with the files the platform traces from its
    // entry. A relative import that climbs out of `api/` is a file that may
    // not be shipped with it — and the failure is a module-resolution error
    // during import, before any route exists, which the platform reports as a
    // crashed function with the reason in a log.
    //
    // Workspace specifiers are fine: `@auteur/*` resolves through this
    // package's own `node_modules`, which is beside the function.
    const offences: string[] = [];
    for await (const relative of new Bun.Glob("**/*.ts").scan({
      cwd: `${appRoot}/api`,
    })) {
      const source = await Bun.file(`${appRoot}/api/${relative}`).text();
      for (const match of source.matchAll(/from\s*["'](\.[^"']*)["']/g)) {
        const specifier = match[1] ?? "";
        const resolved = resolve(dirname(`/api/${relative}`), specifier);
        if (!resolved.startsWith("/api/")) {
          offences.push(`${relative}: ${specifier}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });
});

describe("the sweep carries the scheduler's token, not the API token", () => {
  test("a request with no token is refused", async () => {
    expect((await sweepRequest(null)).status).toBe(401);
  });

  test("a wrong token of the same length is refused", async () => {
    expect((await sweepRequest("b-cron-secret-of-16-plus")).status).toBe(401);
  });

  test("POST works too, for a person re-running it by hand", async () => {
    expect((await sweepRequest(CRON, "POST")).status).toBe(200);
  });

  test("the API token is not accepted in its place", async () => {
    // A caller that can release claims can disrupt a run; the value shipped in
    // the client bundle must not reach it.
    expect((await sweepRequest(TOKEN)).status).toBe(401);
  });

  test("the stage secret is not accepted either", async () => {
    // Three secrets, three jobs. The scheduler holds a value it did not choose
    // and cannot rotate; it must not be the key that drives the pipeline.
    expect((await sweepRequest(SECRET)).status).toBe(401);
  });
});

describe("the sweep does not depend on the scheduler's frequency", () => {
  test("an ordinary request re-invokes a stage nobody ran", async () => {
    // The platform allows one cron firing a day on this plan, so a run that
    // stalls at two in the afternoon would resume tomorrow morning if the
    // schedule were the only trigger. Traffic is the trigger; the cron is a
    // backstop for a deployment nobody is using.
    const id = newId();
    await enqueueStage(harness.db, { id, sessionId, stageId: "outline" });
    await harness.db.query(
      `UPDATE sweep_state SET last_swept_at = now() - interval '1 hour'`,
    );

    const response = await appWithCron().request("/api/health");

    expect(response.status).toBe(200);
    expect(invoked).toEqual(["outline"]);
  });

  test("the next request inside the window does not sweep again", async () => {
    const id = newId();
    await enqueueStage(harness.db, { id, sessionId, stageId: "outline" });
    await harness.db.query(
      `UPDATE sweep_state SET last_swept_at = now() - interval '1 hour'`,
    );

    await appWithCron().request("/api/health");
    await appWithCron().request("/api/health");

    // Twice would mean every request in a burst sweeps, which on a cold start
    // per request is one sweep per request.
    expect(invoked).toEqual(["outline"]);
  });

  test("a request to /internal does not sweep", async () => {
    // The sweep's own path and the stage route it invokes. A sweep there would
    // trigger a sweep, and would put the work in front of the one request
    // whose latency is a stage's latency.
    const id = newId();
    await enqueueStage(harness.db, { id, sessionId, stageId: "outline" });
    await harness.db.query(
      `UPDATE sweep_state SET last_swept_at = now() - interval '1 hour'`,
    );

    await appWithCron().request("/api/internal/stage", { method: "POST" });

    expect(invoked).toEqual([]);
  });
});

describe("the schema is brought up to date on access", () => {
  test("a request against an unmigrated database creates the tables", async () => {
    // There is no release phase on this platform, so the alternative to this
    // is a deploy that answers every request with "relation does not exist".
    const raw = await harness.db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'sessions'`,
    );
    expect(raw.rows[0]?.["n"]).toBe("1");

    const app = createApp({
      apiToken: TOKEN,
      db: harness.db,
      migrateOnBoot: true,
    });
    expect((await app.request("/api/health")).status).toBe(200);
  });
});
