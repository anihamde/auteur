import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { ROUTES } from "@auteur/api-contract/routes";
import { createDb, type Db } from "@auteur/db/db";
import { readSince } from "@auteur/event-store/events";
import { newId } from "@auteur/ids/new-id";
import { readPins } from "@auteur/session-store/pins";
import { createSession } from "@auteur/session-store/sessions";
import { enqueueStage, findQueueEntry } from "@auteur/stage-queue/queue";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import { createApp } from "../../server/_app.ts";
import {
  SIGNATURE_HEADER,
  signPayload,
} from "../../server/_internal/signature.ts";

/**
 * The app on the handles the deployment actually gives it.
 *
 * Every other suite here builds `createApp` with `createTestDb`'s **direct**
 * handle, and production has a pooled one for every route. `createDb` refuses
 * `transaction` on a pooled handle (§3.1), so `append` and `putPins` threw
 * there and only there: no stage ever recorded an event, and the screen that
 * reads the stream showed a run that never started.
 *
 * So this file builds the app the way `entry.ts` does — pooled for reads and
 * ordinary writes, direct for the writes that must be atomic — and drives the
 * two paths that need it.
 */

const TOKEN = "a-token-of-at-least-16-chars";
const SECRET = "a-stage-secret-of-16-plus";

let harness: TestDb;
let pooled: Db;
let sessionId: string;

beforeAll(async () => {
  harness = await createTestDb();
  pooled = createDb({ endpoint: "pooled", url: harness.url });
});

afterAll(async () => {
  await pooled.close();
  await harness.close();
});

beforeEach(async () => {
  const session = await createSession(harness.db, {
    id: newId(),
    idea: "a lighthouse keeper",
    lengthPreset: "flash",
  });
  sessionId = session.id;
});

/** Pooled for everything but the transactional writes, as `entry.ts` builds it. */
const app = () =>
  createApp({
    apiToken: TOKEN,
    db: pooled,
    directDb: harness.db,
    internalStage: {
      runStageBody: async ({ emit, stageId }) => {
        await emit({ line: "measured", stageId, type: "stage_detail" });
        return { ok: true };
      },
      stageSecret: SECRET,
    },
  });

describe("a stage records its events on the handle that can hold them", () => {
  test("running a stage appends what it emitted, and completes the row", async () => {
    const queueId = newId();
    await enqueueStage(harness.db, {
      id: queueId,
      sessionId,
      stageId: "draft",
    });

    const raw = JSON.stringify({ queueId, sessionId, stageId: "draft" });
    const response = await app().request(ROUTES.internalStage.path, {
      body: raw,
      headers: {
        "content-type": "application/json",
        [SIGNATURE_HEADER]: signPayload(SECRET, raw),
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ claimed: true });
    // The event is the assertion. Before the direct handle reached `append`,
    // this threw inside the stage and the row ended `error` with nothing
    // recorded — a run that looks stalled rather than failed.
    expect(
      (await readSince(harness.db, sessionId, 0)).map(
        (stored) => stored.event.type,
      ),
    ).toContain("stage_detail");
    expect((await findQueueEntry(harness.db, queueId))?.status).toBe("done");
  });
});

describe("replacing a session's pins runs on the handle that can hold it", () => {
  test("a PUT lands, rather than failing on the transaction", async () => {
    const response = await app().request(
      ROUTES.pins.path.replace(":id", sessionId),
      {
        body: JSON.stringify({ pins: { draft: "gpt-5" } }),
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
        method: "PUT",
      },
    );

    expect(response.status).toBe(200);
    expect([...(await readPins(harness.db, sessionId))]).toEqual([
      ["draft", "gpt-5"],
    ]);
  });
});
