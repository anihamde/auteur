import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { errorResponseSchema, ROUTES } from "@auteur/api-contract/routes";
import type { Question } from "@auteur/core/session";
import { newId } from "@auteur/ids/new-id";
import { putArtifact } from "@auteur/session-store/artifacts";
import { putQuestionRound } from "@auteur/session-store/questions";
import { createSession } from "@auteur/session-store/sessions";
import { listQueueForSession } from "@auteur/stage-queue/queue";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import { createApp } from "../../server/_app.ts";

const TOKEN = "a-token-of-at-least-16-chars";

let harness: TestDb;
let sessionId: string;

beforeAll(async () => {
  harness = await createTestDb();
});

afterAll(async () => {
  await harness.close();
});

const post = async (
  path: string,
  body: unknown,
  spans: { from: number; to: number }[] = [],
): Promise<Response> => {
  const app = createApp({
    apiToken: TOKEN,
    db: harness.db,
    recordSpan: async ({ from, to }) => {
      spans.push({ from, to });
    },
  });
  return app.request(path, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
};

const aQuestion = (
  ordinal: number,
  dependsOn: readonly string[] = [],
): Question => ({
  answer: null,
  answerState: "open",
  decision: `Decision number ${ordinal.toString()}`,
  dependsOn: [...dependsOn],
  id: newId(),
  ordinal,
  round: 1,
  sessionId,
  suggestions: ["One", "Two"],
  text: `Question number ${ordinal.toString()}?`,
  whyAsked: "Because the premise turns on it.",
});

beforeEach(async () => {
  const session = await createSession(harness.db, {
    id: newId(),
    idea: "a lighthouse keeper",
    lengthPreset: "flash",
  });
  sessionId = session.id;
});

describe("editing an answer invalidates its descendants and keeps the rows", () => {
  test("every transitive descendant is marked, and none is deleted", async () => {
    // §6.5's tree. "You answered this, then changed it" stays visible in the
    // log — a deleted row would make the history a lie by omission.
    const root = aQuestion(0);
    const child = aQuestion(1, [root.id]);
    const grandchild = aQuestion(2, [child.id]);
    const unrelated = aQuestion(3);
    await putQuestionRound(harness.db, [root, child, grandchild, unrelated]);

    const response = await post(`/api/sessions/${sessionId}/answers`, {
      answer: "Only at the end",
      questionId: root.id,
    });
    expect(response.status).toBe(200);
    const body = ROUTES.answers.response.parse(await response.json());

    expect(new Set(body.invalidated)).toEqual(
      new Set([child.id, grandchild.id]),
    );
    // Four rows in, four rows out.
    expect(body.questions).toHaveLength(4);
    const byId = new Map(body.questions.map((q) => [q.id, q.answerState]));
    expect(byId.get(root.id)).toBe("answered");
    expect(byId.get(child.id)).toBe("invalidated");
    expect(byId.get(grandchild.id)).toBe("invalidated");
    expect(byId.get(unrelated.id)).toBe("open");
  });

  test("the edited question is not itself invalidated", async () => {
    // It was edited, not withdrawn.
    const root = aQuestion(0);
    await putQuestionRound(harness.db, [root]);
    const body = ROUTES.answers.response.parse(
      await (
        await post(`/api/sessions/${sessionId}/answers`, {
          answer: "Never",
          questionId: root.id,
        })
      ).json(),
    );
    expect(body.invalidated).toEqual([]);
    expect(body.questions[0]?.answerState).toBe("answered");
  });

  test("skipping is an answer of null, and still invalidates below", async () => {
    const root = aQuestion(0);
    const child = aQuestion(1, [root.id]);
    await putQuestionRound(harness.db, [root, child]);
    const body = ROUTES.answers.response.parse(
      await (
        await post(`/api/sessions/${sessionId}/answers`, {
          answer: null,
          questionId: root.id,
        })
      ).json(),
    );
    expect(body.invalidated).toEqual([child.id]);
    const byId = new Map(body.questions.map((q) => [q.id, q.answerState]));
    expect(byId.get(root.id)).toBe("skipped");
  });

  test("answering a question that is not in this session is 404", async () => {
    const response = await post(`/api/sessions/${sessionId}/answers`, {
      answer: "Never",
      questionId: newId(),
    });
    expect(response.status).toBe(404);
  });
});

describe("regenerating a selection", () => {
  const STORY = [
    "The lamp turned through the fog.",
    "He had never once walked down to the water.",
    "His father had, and had not come back.",
    "The bell rang the hours whether or not anyone counted them.",
  ].join(" ");

  const seedDraft = async (markdown = STORY): Promise<void> => {
    await putArtifact(harness.db, {
      body: { markdown, title: "Landfall", wordCount: 40 },
      inputKey: "draft-key",
      kind: "draft",
      sessionId,
    });
  };

  test("a selection is snapped outward to sentence boundaries before it reaches the prompt", async () => {
    // Regenerating half a sentence produces a splice that reads as a splice.
    await seedDraft();
    const spans: { from: number; to: number }[] = [];
    // Mid-word inside the second sentence.
    const from = STORY.indexOf("never");
    const to = STORY.indexOf("walked") + 3;

    const response = await post(
      `/api/sessions/${sessionId}/regenerate`,
      { from, kind: "selection", to },
      spans,
    );
    expect(response.status).toBe(200);

    const span = spans[0];
    expect(span).toBeDefined();
    expect(span?.from).toBeLessThanOrEqual(from);
    expect(span?.to).toBeGreaterThanOrEqual(to);
    const snapped = STORY.slice(span?.from ?? 0, span?.to ?? 0).trim();
    // Widened, never narrowed: the whole sentence, not the fragment.
    expect(snapped).toContain("He had never once walked down to the water.");
  });

  test("a selection above 60% of the word count is refused with invalid_input", async () => {
    await seedDraft();
    const response = await post(`/api/sessions/${sessionId}/regenerate`, {
      from: 0,
      kind: "selection",
      to: STORY.length,
    });
    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe(
      "invalid_input",
    );
  });

  test("the limit is measured after snapping, not before", async () => {
    // Snapping widens, so measuring the raw selection would let a request
    // through that, once widened, rewrites more than the limit allows.
    // Ten words in two very unequal sentences. Selecting four of them is 40%
    // — under the limit. Snapped outward it becomes the whole first sentence,
    // eight of ten, which is over it.
    const lopsided = "One two three four five six seven eight. Nine ten.";
    await seedDraft(lopsided);
    const response = await post(`/api/sessions/${sessionId}/regenerate`, {
      from: 0,
      kind: "selection",
      to: 18,
    });
    expect(response.status).toBe(400);
  });

  test("regenerating a selection with no draft is invalid_input, not a crash", async () => {
    const response = await post(`/api/sessions/${sessionId}/regenerate`, {
      from: 0,
      kind: "selection",
      to: 10,
    });
    expect(response.status).toBe(400);
  });

  test("an empty selection is refused", async () => {
    await seedDraft();
    const response = await post(`/api/sessions/${sessionId}/regenerate`, {
      from: 20,
      kind: "selection",
      to: 20,
    });
    expect(response.status).toBe(400);
  });

  test("it enqueues revise, not a second pipeline", async () => {
    // §6.9: a selection is `revise` with a span instead of findings.
    await seedDraft();
    const response = await post(`/api/sessions/${sessionId}/regenerate`, {
      from: STORY.indexOf("His father"),
      kind: "selection",
      to: STORY.indexOf("come back") + 9,
    });
    expect(
      ROUTES.regenerate.response.parse(await response.json()).enqueued,
    ).toEqual(["revise"]);
    const queue = await listQueueForSession(harness.db, sessionId);
    expect(queue.map((entry) => entry.stageId)).toEqual(["revise"]);
  });
});

describe("regenerating the outline", () => {
  test("it enqueues outline and needs no draft", async () => {
    const response = await post(`/api/sessions/${sessionId}/regenerate`, {
      kind: "outline",
    });
    expect(response.status).toBe(200);
    expect(
      ROUTES.regenerate.response.parse(await response.json()).enqueued,
    ).toEqual(["outline"]);
  });

  test("an unknown kind is refused rather than defaulted", async () => {
    const response = await post(`/api/sessions/${sessionId}/regenerate`, {
      kind: "everything",
    });
    expect(response.status).toBe(400);
  });
});
