import { describe, expect, test } from "bun:test";
import { DEFAULT_PIPELINE, STAGE_IDS } from "@auteur/config/stages";
import type { Pipeline, Stage } from "@auteur/core/pipeline";
import {
  findCycle,
  indexStages,
  upstreamOf,
  validatePipeline,
} from "./pipeline.ts";

const stage = (overrides: Partial<Stage> = {}): Stage => ({
  id: "s",
  reads: [],
  role: "measure",
  streams: false,
  typed: false,
  ...overrides,
});

const pipelineOf = (stages: Stage[]): Pipeline => ({
  id: "p",
  name: "P",
  stages,
});

describe("the default pipeline is runnable", () => {
  test("it validates", () => {
    expect(() => validatePipeline(DEFAULT_PIPELINE)).not.toThrow();
  });

  test("it has the ten stages §6.2 names", () => {
    expect(STAGE_IDS).toEqual([
      "corpus-select",
      "work-fetch",
      "prosody-compute",
      "style-extract",
      "clarify",
      "outline",
      "draft",
      "critique",
      "revise",
      "style-fit",
    ]);
  });

  test("three stages run no model, and they are the deterministic ones", () => {
    // The optionality exists for exactly these: fetching, measuring prosody,
    // and computing the report. Each gets a Thinking row with a null tier
    // badge, and tier resolution needs no "some stages have no model" case.
    const modelless = DEFAULT_PIPELINE.stages
      .filter((entry) => entry.tier === undefined)
      .map((entry) => entry.id);
    expect(modelless).toEqual(["work-fetch", "prosody-compute", "style-fit"]);
  });

  test("draft is the one untyped model stage", () => {
    // Prose is not a schema, and asking for it inside a JSON string would put
    // an escaping problem between the model and the story.
    const untyped = DEFAULT_PIPELINE.stages
      .filter((entry) => entry.tier !== undefined && !entry.typed)
      .map((entry) => entry.id);
    expect(untyped).toEqual(["draft"]);
  });

  test("draft and revise are the streaming stages", () => {
    expect(
      DEFAULT_PIPELINE.stages
        .filter((entry) => entry.streams)
        .map((entry) => entry.id),
    ).toEqual(["draft", "revise"]);
  });
});

describe("staleness falls out of reads", () => {
  const index = indexStages(DEFAULT_PIPELINE);

  test("changing the author restales everything after corpus-select", () => {
    // Nothing codes this. It is the transitive closure of `reads`.
    expect([...upstreamOf(index, "draft")]).toContain("corpus-select");
    expect([...upstreamOf(index, "style-fit")]).toContain("corpus-select");
  });

  test("the card does not depend on the answers", () => {
    // So changing an answer restales the outline and the draft, and leaves the
    // card — which is §7.5's first consequence, and it is not written anywhere
    // as a rule.
    expect([...upstreamOf(index, "style-extract")]).not.toContain("clarify");
  });

  test("corpus-select depends on nothing", () => {
    expect([...upstreamOf(index, "corpus-select")]).toEqual([]);
  });
});

describe("a definition that cannot run is refused at startup", () => {
  test("reads naming a stage that does not exist", () => {
    // Otherwise the input key walks into nothing and staleness silently stops
    // propagating from that edge.
    expect(() =>
      validatePipeline(pipelineOf([stage({ reads: ["ghost"] })])),
    ).toThrow("reads ghost, which is not a stage");
  });

  test("a cycle, named as the path that closes it", () => {
    expect(() =>
      validatePipeline(
        pipelineOf([
          stage({ id: "a", reads: ["b"] }),
          stage({ id: "b", reads: ["a"] }),
        ]),
      ),
    ).toThrow(/cycle: a → b → a|cycle: b → a → b/);
  });

  test("a self-read is a cycle too", () => {
    expect(findCycle(pipelineOf([stage({ id: "a", reads: ["a"] })]))).toEqual([
      "a",
      "a",
    ]);
  });

  test("a tier with no prompt is a model with nothing to send it", () => {
    expect(() =>
      validatePipeline(pipelineOf([stage({ tier: "cheap" })])),
    ).toThrow("a model with nothing to send it");
  });

  test("a prompt with no tier is something to send and no model", () => {
    expect(() =>
      validatePipeline(pipelineOf([stage({ promptId: "draft" })])),
    ).toThrow("no model to send it to");
  });

  test("a typed stage that runs no model has no output to parse", () => {
    expect(() =>
      validatePipeline(pipelineOf([stage({ typed: true })])),
    ).toThrow("no output to parse");
  });

  test("two stages sharing an id", () => {
    expect(() =>
      validatePipeline(pipelineOf([stage({ id: "a" }), stage({ id: "a" })])),
    ).toThrow("share an id");
  });

  test("every problem is reported at once, not the first", () => {
    // A contributor fixing a tier list should learn about the second problem
    // now, not after deploying the fix for the first.
    try {
      validatePipeline(
        pipelineOf([
          stage({ id: "a", reads: ["ghost"], tier: "cheap" }),
          stage({ id: "b", typed: true }),
        ]),
      );
      throw new Error("should have thrown");
    } catch (thrown) {
      const problems = (thrown as { detail?: { problems?: string[] } }).detail
        ?.problems;
      expect(problems?.length).toBeGreaterThanOrEqual(3);
    }
  });

  test("a definition the schema rejects fails before the graph checks", () => {
    expect(() =>
      validatePipeline({ id: "", name: "", stages: [] } as Pipeline),
    ).toThrow("not a valid pipeline");
  });
});
