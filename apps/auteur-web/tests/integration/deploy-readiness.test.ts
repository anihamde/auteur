import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { ROUTES } from "@auteur/api-contract/routes";
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
      `${import.meta.dir}/../../../../vercel.json`,
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
  const repoRoot = `${import.meta.dir}/../../../..`;

  test("the functions glob names a directory holding a catch-all", async () => {
    // Vercel builds a function per file in `api/` **at the root of the
    // deployment**, and `vercel.json` sits at the repository root, so that is
    // the repository. The app's own entry point lives beside the app; the root
    // file re-exports it.
    //
    // Get this wrong and the deploy succeeds, the static site serves, and
    // every route answers 404 — including `/api/health`, which is the thing
    // one checks to decide whether the deploy worked.
    const config = (await Bun.file(`${repoRoot}/vercel.json`).json()) as {
      functions: Record<string, unknown>;
      rewrites: { destination: string; source: string }[];
    };
    const globs = Object.keys(config.functions);
    expect(globs).toHaveLength(1);
    const directory = globs[0]?.replace(/\/\*\*$/, "");
    expect(
      await Bun.file(`${repoRoot}/${directory}/[[...path]].ts`).exists(),
    ).toBe(true);

    // Both rewrites land on `/api`, which is the catch-all's own path.
    expect(config.rewrites.map((rule) => rule.destination)).toEqual([
      "/api",
      "/api",
    ]);
  });

  test("the root entry re-exports exactly what the app entry exports", async () => {
    // Compared as two sets read from the two files, not against a written
    // list: a verb added to the app and not re-exported would 405 in
    // production and nowhere else, since every app test calls `app.fetch`
    // directly and never loads this file.
    //
    // Read as source rather than imported. Importing either entry constructs
    // the app — `env()`, two database pools, a provider client — which is the
    // work the deployment does on a cold start and not something a test should
    // do to count names.
    const names = (source: string): string[] =>
      [...source.matchAll(/export (?:const|default|\{ ?)([\w, ]*)/g)]
        .flatMap((match) => (match[1] ?? "default").split(","))
        .map((name) => name.trim())
        .filter((name) => name.length > 0 && name === name.toUpperCase())
        .sort();

    const root = await Bun.file(`${repoRoot}/api/[[...path]].ts`).text();
    const app = await Bun.file(
      `${repoRoot}/apps/auteur-web/api/[[...path]].ts`,
    ).text();
    expect(names(root)).toEqual(names(app));
    expect(names(root).length).toBeGreaterThan(0);
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
