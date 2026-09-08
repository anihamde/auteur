import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { ROUTES } from "@auteur/api-contract/routes";
import { DEFAULT_PIPELINE } from "@auteur/config/stages";
import type { Question, Step } from "@auteur/core/session";
import { newId } from "@auteur/ids/new-id";
import { putPins } from "@auteur/session-store/pins";
import {
  answerQuestion,
  putQuestionRound,
} from "@auteur/session-store/questions";
import {
  createSession,
  requireSession,
  updateSession,
} from "@auteur/session-store/sessions";
import { recordStageKey } from "@auteur/session-store/stage-keys";
import { listQueueForSession } from "@auteur/stage-queue/queue";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import { createApp } from "../../api/_app.ts";
import { stalenessInputFor } from "../../api/_routes/advance.ts";
import { inputKeys } from "../../api/_staleness.ts";

/**
 * §7.5's six consequences, one test each.
 *
 * They are named rather than folded into a table because each is a claim the
 * design makes in prose, and a failure should say which claim broke rather
 * than "case 4".
 */

const TOKEN = "a-token-of-at-least-16-chars";
const AUTHOR = "gutenberg:chekhov-anton-pavlovich-1860";

let harness: TestDb;
let sessionId: string;

beforeAll(async () => {
  harness = await createTestDb();
  await harness.db.query(
    `INSERT INTO authors (id, provider, kind, display_name, work_count)
     VALUES ($1, 'gutenberg', 'full-text', 'Chekhov', 12)`,
    [AUTHOR],
  );
});

afterAll(async () => {
  await harness.close();
});

/** Every stage recorded as completed with the key it would have right now. */
const markEverythingCurrent = async (id: string): Promise<void> => {
  const keys = inputKeys(await stalenessInputFor(harness.db, id));
  for (const [stageId, key] of keys) {
    await recordStageKey(harness.db, id, stageId, key);
  }
};

const staleNow = async (id: string): Promise<string[]> => {
  const input = await stalenessInputFor(harness.db, id);
  const keys = inputKeys(input);
  return DEFAULT_PIPELINE.stages
    .filter((stage) => input.completed.get(stage.id) !== keys.get(stage.id))
    .map((stage) => stage.id);
};

const aQuestion = (id: string, ordinal: number): Question => ({
  answer: null,
  answerState: "open",
  decision: "Whether the sea is ever described",
  dependsOn: [],
  id: newId(),
  ordinal,
  round: 1,
  sessionId: id,
  suggestions: ["Never", "Only at the end"],
  text: "Does he ever see it?",
  whyAsked: "The premise turns on the withholding.",
});

beforeEach(async () => {
  const session = await createSession(harness.db, {
    id: newId(),
    idea: "a lighthouse keeper who has never seen the sea",
    lengthPreset: "flash",
  });
  sessionId = session.id;
  await updateSession(harness.db, sessionId, { authorId: AUTHOR });
  await markEverythingCurrent(sessionId);
});

describe("§7.5's six consequences", () => {
  test("changing an answer restales outline onward, and not the card", async () => {
    const question = aQuestion(sessionId, 0);
    await putQuestionRound(harness.db, [question]);
    await answerQuestion(harness.db, question.id, "Only at the end");

    const stale = await staleNow(sessionId);
    expect(stale).toContain("outline");
    expect(stale).toContain("draft");
    expect(stale).toContain("critique");
    expect(stale).toContain("revise");
    expect(stale).toContain("style-fit");
    // The corpus and the card were not built from the answers.
    expect(stale).not.toContain("corpus-select");
    expect(stale).not.toContain("style-extract");
  });

  test("changing the author restales everything after corpus-select, and the idea survives", async () => {
    await harness.db.query(
      `INSERT INTO authors (id, provider, kind, display_name, work_count)
       VALUES ('gutenberg:other', 'gutenberg', 'full-text', 'Someone else', 3)
       ON CONFLICT (id) DO NOTHING`,
    );
    await updateSession(harness.db, sessionId, { authorId: "gutenberg:other" });

    // "Everything after it" is literal: `clarify` reads `style-extract`, so a
    // new author restales the questions too. What survives is the *idea* — the
    // value, which nothing resets — not a stage.
    const stale = await staleNow(sessionId);
    expect(stale).toEqual(DEFAULT_PIPELINE.stages.map((stage) => stage.id));
    const session = await requireSession(harness.db, sessionId);
    expect(session.idea).toBe("a lighthouse keeper who has never seen the sea");
  });

  test("changing the preset restales outline and draft, and not the card", async () => {
    await updateSession(harness.db, sessionId, { lengthPreset: "short" });

    const stale = await staleNow(sessionId);
    expect(stale).toContain("outline");
    expect(stale).toContain("draft");
    expect(stale).not.toContain("style-extract");
    expect(stale).not.toContain("corpus-select");
    expect(stale).not.toContain("clarify");
  });

  test("pinning a different model for outline restales outline onward", async () => {
    // The correct and non-obvious answer: a beat sheet from a different model
    // is a different beat sheet.
    await putPins(harness.db, sessionId, new Map([["outline", "gpt-5"]]));

    const stale = await staleNow(sessionId);
    expect(stale).toContain("outline");
    expect(stale).toContain("draft");
    expect(stale).toContain("style-fit");
    expect(stale).not.toContain("corpus-select");
    expect(stale).not.toContain("style-extract");
  });

  test("re-entering a step and changing nothing restales nothing", async () => {
    // What makes the design's clickable completed rail rows free.
    expect(await staleNow(sessionId)).toEqual([]);
  });

  test("advance enqueues exactly the stale stages in graph order and returns before any runs", async () => {
    await updateSession(harness.db, sessionId, { lengthPreset: "long" });
    const app = createApp({ apiToken: TOKEN, db: harness.db });

    const response = await app.request(`/api/sessions/${sessionId}/advance`, {
      body: JSON.stringify({ to: "draft" satisfies Step }),
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(response.status).toBe(200);
    const body = ROUTES.advance.response.parse(await response.json());
    expect(body.enqueued).toEqual(["outline", "draft"]);

    // The response arrived with every row still queued: nothing ran.
    const queue = await listQueueForSession(harness.db, sessionId);
    expect(queue.map((entry) => entry.stageId)).toEqual(["outline", "draft"]);
    expect(queue.every((entry) => entry.status === "queued")).toBe(true);
  });
});

describe("advance's scope", () => {
  test("advancing to outline does not enqueue the draft", async () => {
    await updateSession(harness.db, sessionId, { lengthPreset: "long" });
    const app = createApp({ apiToken: TOKEN, db: harness.db });
    const response = await app.request(`/api/sessions/${sessionId}/advance`, {
      body: JSON.stringify({ to: "outline" satisfies Step }),
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const body = ROUTES.advance.response.parse(await response.json());
    expect(body.enqueued).toEqual(["outline"]);
  });

  test("advancing to a step that needs no stage enqueues nothing", async () => {
    // `idea` and `author` are screens, not work. Answering with an empty list
    // is honest; refusing would make the client special-case two of seven.
    const app = createApp({ apiToken: TOKEN, db: harness.db });
    const response = await app.request(`/api/sessions/${sessionId}/advance`, {
      body: JSON.stringify({ to: "author" satisfies Step }),
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(
      ROUTES.advance.response.parse(await response.json()).enqueued,
    ).toEqual([]);
  });

  test("it asks for the first stage to run, and only the first", async () => {
    await updateSession(harness.db, sessionId, { lengthPreset: "long" });
    const invoked: string[] = [];
    const app = createApp({
      apiToken: TOKEN,
      db: harness.db,
      invokeStage: async ({ stageId }) => {
        invoked.push(stageId);
      },
    });
    await app.request(`/api/sessions/${sessionId}/advance`, {
      body: JSON.stringify({ to: "draft" satisfies Step }),
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(invoked).toEqual(["outline"]);
  });

  test("an unknown step is 400, not an empty run", async () => {
    const app = createApp({ apiToken: TOKEN, db: harness.db });
    const response = await app.request(`/api/sessions/${sessionId}/advance`, {
      body: JSON.stringify({ to: "epilogue" }),
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(response.status).toBe(400);
  });
});
