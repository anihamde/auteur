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
import {
  claimStage,
  completeStage,
  listQueueForSession,
} from "@auteur/stage-queue/queue";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import { createApp } from "../../server/_app.ts";
import { stalenessInputFor } from "../../server/_routes/advance.ts";
import { inputKeys, OUTPUT_VERSIONS } from "../../server/_staleness.ts";

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

describe("a stage whose stored shape changed is stale", () => {
  test("bumping a stage's output version restales it and everything downstream", async () => {
    // The failure this closes: `corpus-select`'s inputs are the author alone,
    // so changing the schema `work-fetch` reads its output back with left the
    // stage fresh and its stored document unreadable. `readStageOutput` throws,
    // `work-fetch` fails, the sweep retries it, and every retry fails the same
    // way — the only stage that could rewrite the output is the one staleness
    // reports as up to date.
    await markEverythingCurrent(sessionId);
    expect(await staleNow(sessionId)).toEqual([]);

    const input = await stalenessInputFor(harness.db, sessionId);
    const before = inputKeys(input);
    const after = inputKeys(input, { ...OUTPUT_VERSIONS, "corpus-select": 99 });

    expect(after.get("corpus-select")).not.toBe(before.get("corpus-select"));
    // Downstream follows, because a stage's key includes the keys it reads.
    expect(after.get("work-fetch")).not.toBe(before.get("work-fetch"));
    expect(after.get("draft")).not.toBe(before.get("draft"));
    // And it points one way: a stage downstream changing shape leaves the
    // stages that produced its inputs alone, so bumping `draft` does not
    // re-fetch a corpus.
    const draftBumped = inputKeys(input, { ...OUTPUT_VERSIONS, draft: 99 });
    expect(draftBumped.get("draft")).not.toBe(before.get("draft"));
    expect(draftBumped.get("corpus-select")).toBe(before.get("corpus-select"));
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

describe("advancing is how the wizard moves", () => {
  const advanceTo = async (to: Step): Promise<void> => {
    const app = createApp({ apiToken: TOKEN, db: harness.db });
    const response = await app.request(`/api/sessions/${sessionId}/advance`, {
      body: JSON.stringify({ to }),
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(response.status).toBe(200);
  };

  test("the session's step becomes the step asked for", async () => {
    // The rail offers only steps already behind you, so a screen that starts
    // work and does not record where the reader now is leaves them looking at
    // the screen they just finished with. Every forward control in the client
    // goes through this route.
    await advanceTo("outline");
    expect((await requireSession(harness.db, sessionId)).step).toBe("outline");
  });

  test("a step that runs no stages still moves", async () => {
    // `idea` and `author` map to no stage. Enqueuing nothing is right;
    // staying put is not, and it is how the idea screen created a session and
    // never left.
    await advanceTo("author");
    expect((await requireSession(harness.db, sessionId)).step).toBe("author");
  });
});

describe("choosing an author is the other moment work begins", () => {
  /** The row the screen is holding, which is what the choice carries. */
  const rowFor = (id: string) => ({
    birthYear: 1860,
    deathYear: 1904,
    detail: "16 works",
    displayName: id,
    id,
    kind: "full-text" as const,
    workCount: 16,
  });

  const chooseAuthor = async (
    app: ReturnType<typeof createApp>,
    authorId: string,
  ): Promise<{ enqueued: string[] }> => {
    const response = await app.request(`/api/sessions/${sessionId}/author`, {
      body: JSON.stringify({ author: rowFor(authorId) }),
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(response.status).toBe(200);
    return ROUTES.selectAuthor.response.parse(await response.json()) as {
      enqueued: string[];
    };
  };

  test("it moves the wizard to research", async () => {
    // The step follows the work: choosing an author starts the research
    // stages, and `research` is the screen that shows them running. Without
    // this the client re-read a session still saying `idea` and rendered
    // screen one again — which is what "the button does nothing" was.
    const app = createApp({ apiToken: TOKEN, db: harness.db });
    await chooseAuthor(app, "gutenberg:chekhov");
    expect((await requireSession(harness.db, sessionId)).step).toBe("research");
  });

  test("it records the author and enqueues the research stages", async () => {
    // Nothing on the research screen calls `advance`: it renders four stages
    // already running, because choosing the author started them. Without this
    // the screen shows four rows that never move.
    const app = createApp({ apiToken: TOKEN, db: harness.db });

    const { enqueued } = await chooseAuthor(app, "gutenberg:chekhov");

    expect(enqueued).toEqual([
      "corpus-select",
      "work-fetch",
      "prosody-compute",
      "style-extract",
    ]);
    expect((await requireSession(harness.db, sessionId)).authorId).toBe(
      "gutenberg:chekhov",
    );
    expect(
      (await listQueueForSession(harness.db, sessionId)).map(
        (row) => row.stageId,
      ),
    ).toEqual(enqueued);
  });

  test("choosing the same author again enqueues nothing", async () => {
    // Staleness is computed from the author, so re-choosing restales nothing —
    // the same property that makes a completed rail row free to click.
    const app = createApp({ apiToken: TOKEN, db: harness.db });
    await chooseAuthor(app, "gutenberg:chekhov");
    await harness.db.query(`DELETE FROM stage_queue`);
    for (const stage of [
      "corpus-select",
      "work-fetch",
      "prosody-compute",
      "style-extract",
    ]) {
      const input = await stalenessInputFor(harness.db, sessionId);
      await recordStageKey(
        harness.db,
        sessionId,
        stage,
        inputKeys(input).get(stage) ?? "",
      );
    }

    expect((await chooseAuthor(app, "gutenberg:chekhov")).enqueued).toEqual([]);
  });

  test("a different author restales the run", async () => {
    const app = createApp({ apiToken: TOKEN, db: harness.db });
    await chooseAuthor(app, "gutenberg:chekhov");
    await harness.db.query(`DELETE FROM stage_queue`);

    expect((await chooseAuthor(app, "gutenberg:borges")).enqueued).toEqual([
      "corpus-select",
      "work-fetch",
      "prosody-compute",
      "style-extract",
    ]);
  });

  test("a stage that already ran is queued again, not reported and skipped", async () => {
    // The failure this closes: `(session_id, stage_id, attempt)` is unique, so
    // a stage that ran left a finished attempt-0 row and the re-enqueue hit
    // it. `enqueued` named four stages, the queue got rows for none of them,
    // and the run continued against the previous author's corpus. What is
    // reported has to be what is claimable.
    const app = createApp({ apiToken: TOKEN, db: harness.db });
    await chooseAuthor(app, "gutenberg:chekhov");
    for (const row of await listQueueForSession(harness.db, sessionId)) {
      const claimant = newId();
      await claimStage(harness.db, row.id, claimant);
      await completeStage(harness.db, row.id, claimant);
    }

    const { enqueued } = await chooseAuthor(app, "gutenberg:borges");
    const queued = await listQueueForSession(harness.db, sessionId);
    expect(queued.map((row) => row.stageId)).toEqual(enqueued);
    expect(queued.every((row) => row.status === "queued")).toBe(true);
  });
});
