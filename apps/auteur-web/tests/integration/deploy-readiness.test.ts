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
import {
  SIGNATURE_HEADER,
  signPayload,
} from "../../api/_internal/signature.ts";

/**
 * The cron path `vercel.json` names must be answerable.
 *
 * Without this the schedule fires into a 404 every minute and every lost stage
 * invocation stays lost — the sweep written, tested and unreachable, which is
 * exactly how it shipped before this suite existed.
 */

const TOKEN = "a-token-of-at-least-16-chars";
const SECRET = "a-stage-secret-of-16-plus";

let harness: TestDb;
let sessionId: string;
const invoked: string[] = [];

const appWithCron = (): ReturnType<typeof createApp> =>
  createApp({
    apiToken: TOKEN,
    cron: {
      invokeStage: async ({ stageId }) => {
        invoked.push(stageId);
      },
      stageSecret: SECRET,
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

const post = async (signature?: string | null): Promise<Response> => {
  const raw = "{}";
  return appWithCron().request(ROUTES.internalSweep.path, {
    body: raw,
    headers: {
      "content-type": "application/json",
      ...(signature === null
        ? {}
        : { [SIGNATURE_HEADER]: signature ?? signPayload(SECRET, raw) }),
    },
    method: "POST",
  });
};

describe("the path vercel.json's cron names is answerable", () => {
  test("it is the sweep's path, and it is not a 404", async () => {
    const config = (await Bun.file(
      `${import.meta.dir}/../../../../vercel.json`,
    ).json()) as { crons: { path: string }[] };
    expect(config.crons[0]?.path).toBe(ROUTES.internalSweep.path);
    expect((await post()).status).toBe(200);
  });

  test("a signed sweep re-invokes a row nobody ran", async () => {
    const id = newId();
    await enqueueStage(harness.db, { id, sessionId, stageId: "outline" });
    const body = ROUTES.internalSweep.response.parse(
      await (await post()).json(),
    );
    expect(body.reinvoked).toEqual([id]);
    expect(invoked).toEqual(["outline"]);
  });

  test("a lost claim is released for another attempt", async () => {
    const id = newId();
    await enqueueStage(harness.db, { id, sessionId, stageId: "draft" });
    await claimStage(harness.db, id, "the-lost-invocation");
    const body = ROUTES.internalSweep.response.parse(
      await (await post()).json(),
    );
    expect(body.released).toEqual([id]);
    expect((await findQueueEntry(harness.db, id))?.status).toBe("queued");
  });
});

describe("the sweep carries the stage secret, not the bearer token", () => {
  test("an unsigned request is refused", async () => {
    expect((await post(null)).status).toBe(401);
  });

  test("a wrongly-signed request is refused", async () => {
    expect((await post(signPayload("the-wrong-secret", "{}"))).status).toBe(
      401,
    );
  });

  test("the bearer token is not accepted in its place", async () => {
    // A caller that can release claims can disrupt a run; the browser's token
    // must not reach it.
    const response = await appWithCron().request(ROUTES.internalSweep.path, {
      body: "{}",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(response.status).toBe(401);
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
