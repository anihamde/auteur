import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { ROUTES } from "@auteur/api-contract/routes";
import type { Question } from "@auteur/core/session";
import { newId } from "@auteur/ids/new-id";
import { putQuestionRound } from "@auteur/session-store/questions";
import { createSession } from "@auteur/session-store/sessions";
import { recordStageKey } from "@auteur/session-store/stage-keys";
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

const post = async (path: string, body: unknown): Promise<Response> => {
  const app = createApp({ apiToken: TOKEN, db: harness.db });
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

describe("regenerating a stage", () => {
  test("it enqueues the outline and needs no story", async () => {
    const response = await post(`/api/sessions/${sessionId}/regenerate`, {
      stageId: "outline",
    });
    expect(response.status).toBe(200);
    expect(
      ROUTES.regenerate.response.parse(await response.json()).enqueued,
    ).toEqual(["outline"]);
  });

  test("a stage nothing revises is refused rather than defaulted", async () => {
    const response = await post(`/api/sessions/${sessionId}/regenerate`, {
      stageId: "style-extract",
    });
    expect(response.status).toBe(400);
  });

  test("the old selection body is refused rather than ignored", async () => {
    // Replacing one span was `revise` with a span instead of findings, and
    // `revise` is gone. A client still sending it must fail rather than
    // regenerate something it did not name.
    const response = await post(`/api/sessions/${sessionId}/regenerate`, {
      from: 0,
      kind: "selection",
      to: 100,
    });
    expect(response.status).toBe(400);
  });

  test("it enqueues the stages already built on the outline", async () => {
    // §7.5 cannot see a regenerate: it changes no input, so `draft`'s key —
    // built from `outline`'s key rather than from its output — is the same key
    // after the new beat sheet upserts over the old. Nothing downstream is
    // stale, and the reader keeps the story written from the beat sheet they
    // just discarded, permanently. A finished stage no longer chains past the
    // step, so this route is where the tail is named.
    for (const stageId of ["outline", "story"]) {
      await recordStageKey(harness.db, sessionId, stageId, `${stageId}-key`);
    }
    const response = await post(`/api/sessions/${sessionId}/regenerate`, {
      stageId: "outline",
    });

    expect(
      ROUTES.regenerate.response.parse(await response.json()).enqueued,
    ).toEqual(["outline", "story"]);
    const queue = await listQueueForSession(harness.db, sessionId);
    expect(queue.map((entry) => entry.stageId)).toEqual(["outline", "story"]);
  });

  test("a stage that never ran is not started by regenerating its input", async () => {
    // The half that separates this from the old unconditional chain: a reader
    // regenerating the beat sheet before there is any story must not be
    // charged for a story they have not asked for.
    await recordStageKey(harness.db, sessionId, "outline", "outline-key");
    const response = await post(`/api/sessions/${sessionId}/regenerate`, {
      stageId: "outline",
    });
    expect(
      ROUTES.regenerate.response.parse(await response.json()).enqueued,
    ).toEqual(["outline"]);
  });
});
