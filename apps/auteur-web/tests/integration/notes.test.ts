import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { errorResponseSchema, ROUTES } from "@auteur/api-contract/routes";
import { NOTE_LONGEST } from "@auteur/core/session";
import { newId } from "@auteur/ids/new-id";
import { listRevisionNotes } from "@auteur/session-store/revision-notes";
import { createSession } from "@auteur/session-store/sessions";
import { listQueueForSession } from "@auteur/stage-queue/queue";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import { createApp } from "../../server/_app.ts";

/**
 * `POST /api/sessions/:id/notes`.
 *
 * The route writes a row and nothing else. Everything that follows from a note
 * — which stage is stale, what re-runs — is §7.5's, computed from the note set
 * when `advance` asks. These tests hold that line: a route that started work
 * would be a second opinion about ordering, and the queue is the pipeline's
 * control flow.
 */

const TOKEN = "a-token-of-at-least-16-chars";

let harness: TestDb;
let sessionId: string;

beforeAll(async () => {
  harness = await createTestDb();
});

afterAll(async () => {
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

const post = async (id: string, body: unknown): Promise<Response> => {
  const app = createApp({ apiToken: TOKEN, db: harness.db });
  return app.request(`/api/sessions/${id}/notes`, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
};

describe("a note is written and read back whole", () => {
  test("the response is every note on that stage, not the one just written", async () => {
    await post(sessionId, {
      note: "shorter in the middle",
      stageId: "outline",
    });
    const response = await post(sessionId, {
      note: "and give the ending more room",
      stageId: "outline",
    });

    expect(response.status).toBe(200);
    const body = ROUTES.notes.response.parse(await response.json());
    expect(body.notes.map((entry) => entry.note)).toEqual([
      "shorter in the middle",
      "and give the ending more room",
    ]);
  });

  test("the outline's notes and the story's do not mix", async () => {
    await post(sessionId, {
      note: "shorter in the middle",
      stageId: "outline",
    });
    const response = await post(sessionId, {
      note: "the dialogue is too clean",
      stageId: "story",
    });
    const body = ROUTES.notes.response.parse(await response.json());
    expect(body.notes).toHaveLength(1);
  });
});

describe("filing a note starts nothing", () => {
  test("the queue is untouched, because advance is the route that runs work", async () => {
    // §7.1. A note that enqueued its own stage would re-run it before the
    // reader had finished saying what was wrong — three notes, three runs, two
    // of them against a beat sheet nobody asked about.
    await post(sessionId, {
      note: "shorter in the middle",
      stageId: "outline",
    });
    expect(await listQueueForSession(harness.db, sessionId)).toEqual([]);
  });
});

describe("what the route refuses", () => {
  test("a note on a session that does not exist is a 404, not a 500", async () => {
    // Without the session check the insert fails its foreign key, which
    // reaches the reader as `internal` — a server fault for a request that
    // was merely about the wrong session.
    const response = await post(newId(), {
      note: "shorter in the middle",
      stageId: "outline",
    });
    expect(response.status).toBe(404);
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe(
      "not_found",
    );
  });

  test("a stage that takes no notes is refused", async () => {
    const response = await post(sessionId, {
      note: "measure it differently",
      stageId: "style-extract",
    });
    expect(response.status).toBe(400);
  });

  test("an empty note is refused before it reaches the column", async () => {
    const response = await post(sessionId, { note: "   ", stageId: "outline" });
    expect(response.status).toBe(400);
    expect(await listRevisionNotes(harness.db, sessionId, "outline")).toEqual(
      [],
    );
  });

  test("a note past the ceiling is refused rather than truncated", async () => {
    // Truncating would store something the reader did not write and act on it.
    const response = await post(sessionId, {
      note: "x".repeat(NOTE_LONGEST + 1),
      stageId: "outline",
    });
    expect(response.status).toBe(400);
  });
});
