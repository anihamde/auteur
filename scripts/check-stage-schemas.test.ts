import { describe, expect, test } from "bun:test";
import { checkAll, checkSchema } from "./check-stage-schemas.ts";
import { STAGE_SCHEMAS } from "./stage-schemas.ts";

/**
 * The probe's own logic, offline.
 *
 * What it asks the gateway cannot be tested without the gateway — that is the
 * point of it. What can be tested is that it asks correctly and reads the
 * answer correctly, because a check that reported `accepted` for a refusal
 * would be worse than no check.
 */

const KEY = "a-key";
const MODEL = "claude-sonnet-5";

const respond = (
  status: number,
  body = "{}",
): { fetch: () => Promise<Response>; seen: { body?: string } } => {
  const seen: { body?: string } = {};
  return {
    fetch: async () => new Response(body, { status }),
    seen,
  };
};

describe("the request is one the gateway will actually judge", () => {
  test("strict json_schema, the stage's name, and a floor on output", async () => {
    // A schema sent without `strict` is validated by a looser dialect, so a
    // check that omitted it would pass exactly the schemas that fail in
    // production.
    let sent: Record<string, unknown> = {};
    await checkSchema(
      KEY,
      MODEL,
      "outline",
      { type: "object" },
      {
        fetch: async (_url, init) => {
          sent = JSON.parse(init.body) as Record<string, unknown>;
          return new Response("{}", { status: 200 });
        },
      },
    );
    expect(sent["text"]).toEqual({
      format: {
        name: "outline",
        schema: { type: "object" },
        strict: true,
        type: "json_schema",
      },
    });
    expect(sent["max_output_tokens"]).toBe(16);
    expect(sent["store"]).toBe(false);
  });
});

describe("a refusal is read as a refusal", () => {
  test("the gateway's own sentence is the finding, untranslated", async () => {
    // "Enum value None does not match declared type 'string'" is the whole
    // diagnosis; any paraphrase is a worse one.
    const verdict = await checkSchema(
      KEY,
      MODEL,
      "style-extract",
      {},
      {
        fetch: async () =>
          new Response(
            "400 output_config.format.schema: Invalid schema: Enum value None does not match declared type 'string'",
            { status: 400 },
          ),
      },
    );
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain("Enum value None");
  });

  test("a request that never arrives is not an acceptance", async () => {
    // "Could not ask" is not "accepted", and a check that conflated them would
    // go green on a network blip.
    const verdict = await checkSchema(
      KEY,
      MODEL,
      "clarify",
      {},
      {
        fetch: () => Promise.reject(new TypeError("fetch failed")),
      },
    );
    expect(verdict).toMatchObject({ accepted: false, reason: "fetch failed" });
  });

  test("a 200 is the only acceptance", async () => {
    const { fetch } = respond(200);
    expect(await checkSchema(KEY, MODEL, "clarify", {}, { fetch })).toEqual({
      accepted: true,
      stageId: "clarify",
    });
  });
});

describe("every stage is asked, and none is asked twice", () => {
  test("one verdict per schema, in one request each", async () => {
    let calls = 0;
    const verdicts = await checkAll(KEY, MODEL, STAGE_SCHEMAS, {
      fetch: async () => {
        calls += 1;
        return new Response("{}", { status: 200 });
      },
    });
    expect(calls).toBe(Object.keys(STAGE_SCHEMAS).length);
    expect(verdicts.map((verdict) => verdict.stageId).sort()).toEqual(
      Object.keys(STAGE_SCHEMAS).sort(),
    );
  });

  test("the collection holds every stage that sends a schema", () => {
    // Enumerating them at the call site is how the sixth gets forgotten, and a
    // schema nobody checks is the one that takes the pipeline down.
    expect(Object.keys(STAGE_SCHEMAS).sort()).toEqual([
      "clarify",
      "corpus-select",
      "outline",
      // Two, because the card is read in two passes.
      "style-extract",
      "style-fields",
    ]);
  });
});
