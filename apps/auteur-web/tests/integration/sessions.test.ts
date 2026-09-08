import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { errorResponseSchema, ROUTES } from "@auteur/api-contract/routes";
import type { Question } from "@auteur/core/session";
import { newId } from "@auteur/ids/new-id";
import { putArtifact } from "@auteur/session-store/artifacts";
import { putQuestionRound } from "@auteur/session-store/questions";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import { createApp } from "../../api/_app.ts";

/**
 * The four session routes against a real database.
 *
 * Not a unit test with a stubbed store: the properties under test are
 * Postgres's — a cascade that takes the questions with the session, a patch
 * that leaves an unnamed column alone — and a stub would assert that the code
 * called the stub.
 */

const TOKEN = "a-token-of-at-least-16-chars";

let harness: TestDb;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  harness = await createTestDb();
  app = createApp({ apiToken: TOKEN, db: harness.db });
});

afterAll(async () => {
  await harness.close();
});

const call = async (path: string, init: RequestInit = {}): Promise<Response> =>
  app.request(path, {
    ...init,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });

const oneQuestion = (sessionId: string): Question => ({
  answer: null,
  answerState: "open",
  decision: "Whether the sea is ever described",
  dependsOn: [],
  id: newId(),
  ordinal: 0,
  round: 1,
  sessionId,
  suggestions: ["Never", "Only at the end"],
  text: "Does he ever see it?",
  whyAsked: "The premise turns on the withholding.",
});

const createOne = async (idea = "a lighthouse keeper"): Promise<string> => {
  const response = await call(ROUTES.createSession.path, {
    body: JSON.stringify({ idea, lengthPreset: "flash" }),
    method: "POST",
  });
  expect(response.status).toBe(201);
  return ROUTES.createSession.response.parse(await response.json()).id;
};

describe("POST /api/sessions", () => {
  test("it creates a session at the idea step", async () => {
    const response = await call(ROUTES.createSession.path, {
      body: JSON.stringify({
        constraints: "no second person",
        idea: "a lighthouse keeper",
        lengthPreset: "flash",
      }),
      method: "POST",
    });
    expect(response.status).toBe(201);
    const session = ROUTES.createSession.response.parse(await response.json());
    expect(session.step).toBe("idea");
    expect(session.constraints).toBe("no second person");
    // Verbatim: nothing rewrites the idea before it reaches the pipeline.
    expect(session.idea).toBe("a lighthouse keeper");
  });

  test("an empty idea is refused, not stored", async () => {
    const response = await call(ROUTES.createSession.path, {
      body: JSON.stringify({ idea: "", lengthPreset: "flash" }),
      method: "POST",
    });
    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe(
      "invalid_input",
    );
  });

  test("a preset outside the four is refused", async () => {
    const response = await call(ROUTES.createSession.path, {
      body: JSON.stringify({ idea: "a lighthouse", lengthPreset: "epic" }),
      method: "POST",
    });
    expect(response.status).toBe(400);
  });
});

describe("GET /api/sessions/:id", () => {
  test("a reload gets the whole session in one response", async () => {
    // Invariant 3: every step is re-enterable. A client that assembles its
    // state from six requests has six chances to render a half-loaded screen.
    const id = await createOne();
    await putQuestionRound(harness.db, [oneQuestion(id)]);
    await putArtifact(harness.db, {
      body: {
        beats: [{ index: 1, text: "The lamp turns." }],
        title: "Landfall",
      },
      inputKey: "k1",
      kind: "outline",
      sessionId: id,
    });
    await putArtifact(harness.db, {
      body: { markdown: "The lamp turned.", title: "Landfall", wordCount: 3 },
      inputKey: "k2",
      kind: "draft",
      sessionId: id,
    });
    await putArtifact(harness.db, {
      body: [
        {
          decision: "Third person limited",
          origin: "model chose — not asked",
          reason: "No question covered point of view.",
        },
      ],
      inputKey: "k3",
      kind: "decisions",
      sessionId: id,
    });

    const response = await call(`/api/sessions/${id}`);
    expect(response.status).toBe(200);
    const view = ROUTES.session.response.parse(await response.json());
    expect(view.session.idea).toBe("a lighthouse keeper");
    expect(view.session.step).toBe("idea");
    expect(view.answers).toHaveLength(1);
    expect(view.answers[0]?.answerState).toBe("open");
    expect(view.outline?.title).toBe("Landfall");
    expect(view.story?.wordCount).toBe(3);
    expect(view.decisions[0]?.origin).toBe("model chose — not asked");
    // Nothing has run the report or chosen an author yet, and the response says
    // so with nulls rather than by omitting the keys.
    expect(view.report).toBeNull();
    expect(view.card).toBeNull();
  });

  test("an unknown id is 404, in the contract's error shape", async () => {
    const response = await call(
      "/api/sessions/b1c9f2e0-0000-4000-8000-abcdefabcdef",
    );
    expect(response.status).toBe(404);
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe(
      "not_found",
    );
  });

  test("an id that is not a uuid is 400, not 404", async () => {
    // The two are different facts: one says the id is unusable, the other that
    // it was looked up and is not there.
    const response = await call("/api/sessions/not-a-uuid");
    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/sessions/:id", () => {
  test("it changes only what the body names", async () => {
    const id = await createOne("a cartographer");
    const response = await call(`/api/sessions/${id}`, {
      body: JSON.stringify({ step: "outline" }),
      method: "PATCH",
    });
    expect(response.status).toBe(200);
    const session = ROUTES.patchSession.response.parse(await response.json());
    expect(session.step).toBe("outline");
    expect(session.idea).toBe("a cartographer");
    expect(session.lengthPreset).toBe("flash");
  });

  test("an explicit null clears a column, and an absent key does not", async () => {
    // The distinction the patch is built key by key to preserve.
    const id = await createOne();
    await call(`/api/sessions/${id}`, {
      body: JSON.stringify({ constraints: "present tense" }),
      method: "PATCH",
    });
    const kept = await call(`/api/sessions/${id}`, {
      body: JSON.stringify({ idea: "a lamplighter" }),
      method: "PATCH",
    });
    expect(
      ROUTES.patchSession.response.parse(await kept.json()).constraints,
    ).toBe("present tense");

    const cleared = await call(`/api/sessions/${id}`, {
      body: JSON.stringify({ constraints: null }),
      method: "PATCH",
    });
    expect(
      ROUTES.patchSession.response.parse(await cleared.json()).constraints,
    ).toBeNull();
  });

  test("patching an unknown session is 404, not a silent no-op", async () => {
    const response = await call(
      "/api/sessions/b1c9f2e0-0000-4000-8000-abcdefabcdef",
      { body: JSON.stringify({ step: "outline" }), method: "PATCH" },
    );
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/sessions/:id", () => {
  test("it takes the session's rows with it", async () => {
    // The cascade is the schema's. This asserts it is actually in force,
    // because a route that deleted only the session row would leave orphans
    // that no query would ever find again.
    const id = await createOne();
    await putQuestionRound(harness.db, [oneQuestion(id)]);
    const response = await call(`/api/sessions/${id}`, { method: "DELETE" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });

    const questions = await harness.db.query(
      `SELECT id FROM questions WHERE session_id = $1`,
      [id],
    );
    expect(questions.rowCount).toBe(0);
    expect((await call(`/api/sessions/${id}`)).status).toBe(404);
  });

  test("deleting an unknown session is 404, not 200", async () => {
    const response = await call(
      "/api/sessions/b1c9f2e0-0000-4000-8000-abcdefabcdef",
      { method: "DELETE" },
    );
    expect(response.status).toBe(404);
  });
});
