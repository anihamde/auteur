import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { errorResponseSchema, ROUTES } from "@auteur/api-contract/routes";
import { DEFAULT_PIPELINE } from "@auteur/config/stages";
import { newId } from "@auteur/ids/new-id";
import { CATALOGUE } from "@auteur/provider-router/models";
import { readPins } from "@auteur/session-store/pins";
import { createSession } from "@auteur/session-store/sessions";
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

beforeEach(async () => {
  const session = await createSession(harness.db, {
    id: newId(),
    idea: "a lighthouse keeper",
    lengthPreset: "flash",
  });
  sessionId = session.id;
});

const put = async (pins: Record<string, string>): Promise<Response> => {
  const app = createApp({ apiToken: TOKEN, db: harness.db });
  return app.request(`/api/sessions/${sessionId}/pins`, {
    body: JSON.stringify({ pins }),
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    method: "PUT",
  });
};

/** Every stage that runs a model. §6.3's "one model for every stage" path. */
const TIERED = DEFAULT_PIPELINE.stages
  .filter((stage) => stage.tier !== undefined)
  .map((stage) => stage.id);

const forEveryStage = (modelId: string): Record<string, string> =>
  Object.fromEntries(TIERED.map((stageId) => [stageId, modelId]));

describe("writing every pin at once", () => {
  test("a model that satisfies every stage is written for all of them", async () => {
    const response = await put(forEveryStage("claude-sonnet-5"));
    expect(response.status).toBe(200);
    const body = ROUTES.pins.response.parse(await response.json());
    expect(Object.keys(body.pins).sort()).toEqual([...TIERED].sort());
  });

  test("a model that cannot emit a strict schema is refused for the typed stages", async () => {
    // §6.3: refused with the reason, never silently applied to `draft` alone.
    // The fixture is read from the catalogue rather than named, so a model that
    // gains structured output at WP-X0 does not silently make this test vacuous
    // — it fails on the assertion below instead.
    const loose = CATALOGUE.find((row) => !row.structuredOutput);
    expect(loose).toBeDefined();
    const typed = DEFAULT_PIPELINE.stages.filter(
      (stage) => stage.typed && stage.tier !== undefined,
    );
    expect(typed.length).toBeGreaterThan(0);

    const response = await put(forEveryStage(loose?.id ?? ""));
    expect(response.status).toBe(400);
    const body = errorResponseSchema.parse(await response.json());
    expect(body.error.message).toContain("none were");
    // Not one of the six typed stages, and not the untyped ones either.
    expect((await readPins(harness.db, sessionId)).size).toBe(0);
  });

  test("one bad pin rejects the whole write, leaving nothing applied", async () => {
    // A half-applied set leaves a pipeline running two models the reader never
    // chose together, which is worse than not writing at all because nobody
    // would think to look for it.
    const response = await put({
      draft: "claude-sonnet-5",
      outline: "no-such-model",
    });
    expect(response.status).toBe(400);
    const body = errorResponseSchema.parse(await response.json());
    expect(body.error.code).toBe("invalid_input");
    expect((await readPins(harness.db, sessionId)).size).toBe(0);
  });

  test("pinning a stage that runs no model is refused with the reason", async () => {
    const response = await put({ "prosody-compute": "claude-sonnet-5" });
    expect(response.status).toBe(400);
    expect((await readPins(harness.db, sessionId)).size).toBe(0);
  });

  test("pinning a stage that is not in the pipeline is refused", async () => {
    const response = await put({ "no-such-stage": "claude-sonnet-5" });
    expect(response.status).toBe(400);
  });
});

describe("the set is replaced, not merged", () => {
  test("a later write removes the pins it omits", async () => {
    await put({ draft: "claude-sonnet-5", outline: "gpt-5" });
    const response = await put({ draft: "gpt-5" });
    const body = ROUTES.pins.response.parse(await response.json());
    expect(body.pins).toEqual({ draft: "gpt-5" });
  });

  test("an empty set clears every pin", async () => {
    await put({ draft: "claude-sonnet-5" });
    const body = ROUTES.pins.response.parse(await (await put({})).json());
    expect(body.pins).toEqual({});
  });
});

describe("the session must exist", () => {
  test("pinning on an unknown session is 404", async () => {
    const app = createApp({ apiToken: TOKEN, db: harness.db });
    const response = await app.request(
      "/api/sessions/b1c9f2e0-0000-4000-8000-abcdefabcdef/pins",
      {
        body: JSON.stringify({ pins: { draft: "gpt-5" } }),
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
        method: "PUT",
      },
    );
    expect(response.status).toBe(404);
  });
});
