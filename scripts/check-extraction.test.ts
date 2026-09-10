import { describe, expect, test } from "bun:test";
import { CLAIM_PATHS, EXEMPLARS } from "../packages/core/src/style-card.ts";
import { CATALOGUE } from "../packages/provider-router/src/models.ts";
import {
  contextOf,
  judge,
  PROBE,
  request,
  runExtractionProbe,
  textOf,
} from "./check-extraction.ts";

/**
 * The probe's own judgement, offline.
 *
 * What a real model returns cannot be tested without a real model — that is
 * what the probe is for. What must be tested is that a correct answer is judged
 * correct: a probe that failed on a good answer would be a check nobody could
 * trust, and the first version of this one did exactly that, resolving
 * citations against ids it had not offered.
 */

const ids = PROBE.passages.map((passage) => passage.id);

/** A complete answer: every path, every one cited, the exemplar floor met. */
const good = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    exemplars: ids.slice(0, EXEMPLARS.min).map((id) => ({
      demonstrates: "the sentence turns on a semicolon",
      passageId: id,
    })),
    fields: CLAIM_PATHS.map((claim, index) => ({
      citationPassageId: ids[index % ids.length],
      path: claim.path,
      value: claim.kind === "list" ? ["a reading", "another"] : "a reading",
    })),
    ...overrides,
  });

describe("a complete answer builds a card", () => {
  test("every path cited, the floor met, and the card parses", () => {
    // The property the deployment failed: an extraction can parse and still
    // leave `styleCardSchema` short a required claim.
    expect(judge(good(), PROBE)).toEqual({
      exemplars: EXEMPLARS.min,
      fields: CLAIM_PATHS.length,
      ok: true,
    });
  });
});

describe("the failures it exists to catch", () => {
  test("the answer the deployment actually got", () => {
    // `fields: []`, one exemplar, an invented id. Valid JSON, accepted schema,
    // no card — and 1,200 passing tests.
    const outcome = judge(
      JSON.stringify({
        exemplars: [
          {
            demonstrates: "x",
            passageId: "00000000-0000-7000-8000-000000000000",
          },
        ],
        fields: [],
      }),
      PROBE,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome).toHaveProperty("lines");
  });

  test("the census tells a path never returned from one returned uncited", () => {
    // The two want opposite fixes — a prompt that did not ask clearly enough,
    // versus the assembler refusing an uncited claim (decision 0004) — and
    // telling them apart from the zod issues alone is guessing.
    const answer = JSON.parse(good()) as {
      fields: { path: string; citationPassageId: string | null }[];
    };
    const dropped = answer.fields.shift();
    const [uncited] = answer.fields;
    if (uncited !== undefined) uncited.citationPassageId = null;

    const outcome = judge(JSON.stringify(answer), PROBE);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    const lines = outcome.lines.join("\n");
    expect(lines).toContain(`never returned: ${dropped?.path ?? ""}`);
    expect(lines).toContain(
      `returned uncited, so not written to the card: ${uncited?.path ?? ""}`,
    );
    expect(lines).toContain(
      `returned ${(CLAIM_PATHS.length - 1).toString()} of ${CLAIM_PATHS.length.toString()} paths`,
    );
  });

  test("a parsing extraction that is one claim short of a card", () => {
    // The subtler half: the schema is satisfied and the card is not. Only the
    // second is the product's promise.
    const short = JSON.parse(good()) as { fields: unknown[] };
    short.fields = short.fields.slice(1);
    const outcome = judge(JSON.stringify(short), PROBE);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.lines.join(" ")).toContain(
        CLAIM_PATHS[0]?.path.split(".")[0] ?? "",
      );
    }
  });

  test("an uncited claim is not a card either", () => {
    // An uncited field is counted against confidence and never written
    // (decision 0004), so a card missing that claim is the correct failure.
    const uncited = JSON.parse(good()) as {
      fields: { citationPassageId: string | null }[];
    };
    for (const field of uncited.fields) field.citationPassageId = null;
    expect(judge(JSON.stringify(uncited), PROBE).ok).toBe(false);
  });

  test("text that is not JSON is named as such", () => {
    expect(judge("I'm sorry, I can't help with that.", PROBE).ok).toBe(false);
  });
});

describe("what it sends is what the product sends", () => {
  test("the prompt is built by the product's own builder", () => {
    // A probe carrying its own copy of the prompt would go green on a prompt
    // nothing uses — the failure mode of every check written beside the thing
    // it checks rather than through it.
    const { prompt, schema } = request(PROBE);
    expect(prompt).toContain("- `voice.pov` (line)");
    expect(prompt).toContain(ids[0] ?? "");
    const properties = (schema as Record<string, Record<string, never>>)[
      "properties"
    ] as unknown as Record<string, Record<string, unknown>>;
    expect(properties["fields"]).toBeDefined();
  });

  test("the fixture offers more passages than the exemplar floor", () => {
    // A probe offering exactly the minimum could be satisfied by exhaustion
    // rather than by reading.
    expect(ids.length).toBeGreaterThan(EXEMPLARS.min);
  });
});

describe("reading the gateway's answer", () => {
  test("output_text when it is offered", () => {
    expect(textOf({ output_text: "{}" })).toBe("{}");
  });

  test("the content walk when it is not", () => {
    // Which shape arrives is the gateway's choice; guessing wrong would report
    // a contract failure for a response the probe simply could not read.
    expect(
      textOf({
        output: [
          { content: [{ text: '{"a":', type: "output_text" }] },
          { content: [{ text: "1}", type: "output_text" }] },
        ],
      }),
    ).toBe('{"a":1}');
  });

  test("neither shape is an empty string, not a throw", () => {
    expect(textOf({ unexpected: true })).toBe("");
  });
});

describe("a refused request is not a contract failure", () => {
  test("a non-2xx reports the status rather than blaming the prompt", async () => {
    const outcome = await runExtractionProbe("key", "m", PROBE, {
      fetch: async () => new Response("nope", { status: 429 }),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.lines[0]).toContain("429");
  });
});

describe("a cut-off answer is a budget, not a prompt", () => {
  test("an incomplete status and its reason are reported", () => {
    // A Responses call that hits `max_output_tokens` returns partial content,
    // and under a strict schema the fragment can be a valid object with empty
    // arrays in it — indistinguishable from a model that read the prompt and
    // declined. The two want completely different fixes.
    expect(
      contextOf(
        {
          incomplete_details: { reason: "max_output_tokens" },
          status: "incomplete",
          usage: { output_tokens: 8000 },
        },
        '{"exemplars":[],"fields":[]}',
      ),
    ).toEqual([
      "status incomplete, incomplete: max_output_tokens, 8000 output tokens, 28 characters of text",
      'answer began: {"exemplars":[],"fields":[]}',
    ]);
  });

  test("a complete answer says so without an incomplete clause", () => {
    expect(contextOf({ status: "completed" }, "{}")[0]).toBe(
      "status completed, 2 characters of text",
    );
  });

  test("a gateway that says none of it still reports the text length", () => {
    // The field names are this gateway's; a different one may carry none of
    // them, and the probe must degrade to something rather than to nothing.
    expect(contextOf({}, "")).toEqual(["0 characters of text"]);
  });

  test("the context reaches the verdict, not just the console", () => {
    const outcome = judge('{"exemplars":[],"fields":[]}', PROBE, [
      "status incomplete, incomplete: max_output_tokens",
    ]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.lines).toContain(
        "status incomplete, incomplete: max_output_tokens",
      );
    }
  });
});

describe("the probe sends what production sends", () => {
  test("the model's own output ceiling, not the probe's idea of enough", async () => {
    // `callModel` defaults `maxTokens` to `model.maxOutputTokens`. A probe
    // with a smaller number is a stricter test than the product ever runs, and
    // an answer cut off at that number would be reported as a prompt failure
    // production does not have.
    let sent: Record<string, unknown> = {};
    await runExtractionProbe("key", "claude-sonnet-5", PROBE, {
      fetch: async (_url, init) => {
        sent = JSON.parse(init.body) as Record<string, unknown>;
        return new Response("{}", { status: 200 });
      },
    });
    const row = CATALOGUE.find((entry) => entry.id === "claude-sonnet-5");
    expect(row).toBeDefined();
    expect(sent["max_output_tokens"]).toBe(row?.maxOutputTokens);
  });
});
