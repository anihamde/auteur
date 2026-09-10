import { describe, expect, test } from "bun:test";
import { CLAIM_PATHS, EXEMPLARS } from "../packages/core/src/style-card.ts";
import { CATALOGUE } from "../packages/provider-router/src/models.ts";
import {
  census,
  contextOf,
  costLine,
  costOf,
  exemplarsRequest,
  fieldsRequest,
  judge,
  PROBE,
  runExtractionProbe,
  textOf,
} from "./check-extraction.ts";

/**
 * The probe's own judgement, offline.
 *
 * What real models return cannot be tested without them — that is what the
 * probe is for. What must be tested is that a correct answer is judged correct:
 * a probe that failed on a good answer would be a check nobody could trust, and
 * the first version of this one did exactly that, resolving citations against
 * ids it had not offered.
 */

const ids = PROBE.passages.map((passage) => passage.id);

const goodFields = () => ({
  fields: CLAIM_PATHS.map((claim, index) => ({
    citationPassageId:
      claim.evidence === "corpus" ? null : (ids[index % ids.length] ?? null),
    path: claim.path,
    value: claim.kind === "list" ? ["a reading", "another"] : "a reading",
  })),
});

const goodExemplars = () => ({
  exemplars: ids.slice(0, EXEMPLARS.min).map((id) => ({
    demonstrates: "the sentence turns on a semicolon",
    passageId: id,
  })),
});

const cost = [{ seconds: 1, stageId: "style-fields" }];

describe("a complete pair of answers builds a card", () => {
  test("every path present, passage claims cited, the floor met", () => {
    // The property the deployment failed: an extraction can parse and still
    // leave `styleCardSchema` short a required claim.
    expect(judge(goodFields(), goodExemplars(), PROBE, cost)).toEqual({
      cost,
      exemplars: EXEMPLARS.min,
      fields: CLAIM_PATHS.length,
      ok: true,
    });
  });
});

describe("the failures it exists to catch", () => {
  test("a parsing pair that is one claim short of a card", () => {
    // The subtler half: the schemas are satisfied and the card is not. Only
    // the second is the product's promise.
    const short = goodFields();
    const outcome = judge(
      { fields: short.fields.slice(1) },
      goodExemplars(),
      PROBE,
      cost,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.lines.join(" ")).toContain(
        CLAIM_PATHS[0]?.path.split(".")[0] ?? "",
      );
    }
  });

  test("a passage claim left uncited is not a card either", () => {
    // A corpus claim carries no citation by design; a passage claim without
    // one is dropped, and the card is then short of it (decision 0030).
    const uncited = goodFields();
    for (const field of uncited.fields) field.citationPassageId = null;
    expect(judge(uncited, goodExemplars(), PROBE, cost).ok).toBe(false);
  });

  test("the census tells a path never returned from one returned uncited", () => {
    // The two want opposite fixes — a prompt that did not ask clearly enough,
    // versus the assembler refusing an uncited claim — and telling them apart
    // from the zod issues alone is guessing.
    const answer = goodFields();
    const dropped = answer.fields.shift();
    const [first] = answer.fields;
    if (first !== undefined) first.citationPassageId = null;

    const lines = census(answer).join("\n");
    expect(lines).toContain(`never returned: ${dropped?.path ?? ""}`);
    expect(lines).toContain(
      `returned uncited, so not written to the card: ${first?.path ?? ""}`,
    );
    expect(lines).toContain(
      `returned ${(CLAIM_PATHS.length - 1).toString()} of ${CLAIM_PATHS.length.toString()} paths`,
    );
  });
});

describe("what each pass sends is what its stage sends", () => {
  test("the fields prompt names the paths and offers the ids", () => {
    // A probe carrying its own copy of the prompt would go green on a prompt
    // nothing uses — the failure mode of every check written beside the thing
    // it checks rather than through it.
    const { prompt } = fieldsRequest(PROBE);
    expect(prompt).toContain("- `voice.pov` (line)");
    expect(prompt).toContain(ids[0] ?? "");
  });

  test("the exemplars prompt carries the readings the first pass took", () => {
    // Without them it asks for passages that are merely interesting, rather
    // than ones demonstrating something the card claims.
    const { prompt } = exemplarsRequest(PROBE, goodFields());
    expect(prompt).toContain("### The readings");
    expect(prompt).toContain("`voice.pov`");
  });

  test("a list value reaches the second prompt as one line, not as [object]", () => {
    const { prompt } = exemplarsRequest(PROBE, {
      fields: [
        { citationPassageId: null, path: "antiPatterns", value: ["a", "b"] },
      ],
    });
    expect(prompt).toContain("`antiPatterns`: a; b");
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

  test("an incomplete status and its reason are reported", () => {
    // A call that hits `max_output_tokens` returns partial content, and under
    // a strict schema that fragment can be a valid object with empty arrays in
    // it — indistinguishable from a model that read the prompt and declined.
    expect(
      contextOf(
        {
          incomplete_details: { reason: "max_output_tokens" },
          status: "incomplete",
        },
        "{}",
      )[0],
    ).toBe(
      "status incomplete, incomplete: max_output_tokens, 2 characters of text",
    );
  });
});

describe("what each pass cost", () => {
  test("tokens out of the usage block, the wall clock, and which pass", () => {
    expect(
      costOf(
        { usage: { input_tokens: 4321, output_tokens: 2100 } },
        "style-fields",
        58.4,
      ),
    ).toEqual({
      inputTokens: 4321,
      outputTokens: 2100,
      seconds: 58.4,
      stageId: "style-fields",
    });
  });

  test("a gateway that reports no usage still reports the seconds", () => {
    // The seconds are this side's measurement and always available; the tokens
    // are the gateway's and may not be. Losing the seconds with them would
    // lose the number that decides whether a stage fits in an invocation.
    expect(costOf({}, "style-extract", 12)).toEqual({
      seconds: 12,
      stageId: "style-extract",
    });
  });

  test("the line names the pass, because each has its own ceiling to fit", () => {
    expect(
      costLine({ outputTokens: 2100, seconds: 28.4, stageId: "style-fields" }),
    ).toBe("style-fields: 28.4s, 2,100 out");
  });
});

describe("both passes run, and both are measured", () => {
  const answer = (body: unknown, outputTokens: number) =>
    new Response(
      JSON.stringify({
        output_text: JSON.stringify(body),
        usage: { output_tokens: outputTokens },
      }),
      { status: 200 },
    );

  test("the fields call, then the exemplars call, each with its own schema", async () => {
    // A probe running one call would be checking a topology the product does
    // not have.
    const sent: Record<string, unknown>[] = [];
    const outcome = await runExtractionProbe("key", "claude-sonnet-5", PROBE, {
      fetch: async (_url, init) => {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        sent.push(body);
        return sent.length === 1
          ? answer(goodFields(), 2100)
          : answer(goodExemplars(), 400);
      },
    });

    expect(sent).toHaveLength(2);
    const names = sent.map(
      (body) =>
        (
          (body["text"] as { format: { name: string } }).format satisfies {
            name: string;
          }
        ).name,
    );
    expect(names).toEqual(["style-fields", "style-extract"]);
    expect(outcome.ok).toBe(true);
    expect(outcome.cost.map((pass) => pass.stageId)).toEqual([
      "style-fields",
      "style-extract",
    ]);
    expect(outcome.cost[0]?.outputTokens).toBe(2100);
  });

  test("the second call is not made when the first does not parse", async () => {
    // And the first pass's cost still reaches the report: a fields call that
    // burned fifty seconds before failing is the finding, not a footnote.
    let calls = 0;
    const outcome = await runExtractionProbe("key", "claude-sonnet-5", PROBE, {
      fetch: async () => {
        calls += 1;
        return answer({ fields: [] }, 40);
      },
    });
    expect(calls).toBe(1);
    expect(outcome.ok).toBe(false);
    expect(outcome.cost).toHaveLength(1);
  });

  test("a refused call reports how long it took to be refused", async () => {
    // Which distinguishes a rejected request from a timed-out one.
    const outcome = await runExtractionProbe("key", "claude-sonnet-5", PROBE, {
      fetch: async () => new Response("nope", { status: 429 }),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.lines[0]).toContain("429");
  });

  test("both passes send the model's own output ceiling", () => {
    // `callModel` defaults `maxTokens` to `model.maxOutputTokens`. A probe with
    // a smaller number is a stricter test than the product ever runs.
    const row = CATALOGUE.find((entry) => entry.id === "claude-sonnet-5");
    expect(row).toBeDefined();
    return runExtractionProbe("key", "claude-sonnet-5", PROBE, {
      fetch: async (_url, init) => {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        expect(body["max_output_tokens"]).toBe(row?.maxOutputTokens);
        return answer(goodFields(), 1);
      },
    });
  });
});

describe("a failure reports its cost as well", () => {
  test("a card that did not build still says what each pass took", () => {
    // A pass that fails *and* sits at the invocation ceiling has two problems.
    // A report naming one sends the reader to fix the wrong one.
    const short = goodFields();
    const outcome = judge(
      { fields: short.fields.slice(1) },
      goodExemplars(),
      PROBE,
      [
        { outputTokens: 2100, seconds: 58.4, stageId: "style-fields" },
        { outputTokens: 400, seconds: 11.2, stageId: "style-extract" },
      ],
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.cost.map(costLine)).toEqual([
      "style-fields: 58.4s, 2,100 out",
      "style-extract: 11.2s, 400 out",
    ]);
  });
});
