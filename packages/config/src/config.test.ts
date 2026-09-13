import { describe, expect, test } from "bun:test";
import { DEFAULT_PIPELINE, STAGE_IDS } from "./stages.ts";
import { TIER_CANDIDATES } from "./tiers.ts";

describe("the pipeline is data, so an alternative is a config file", () => {
  test("nine stages, and the ids are unique", () => {
    // Eleven until `critique` and `revise` went: an automated pass over the
    // prose, two strong-tier calls spent on a judgement the reader was about
    // to make and could state in a sentence (decision 0034).
    expect(STAGE_IDS).toHaveLength(9);
    expect(new Set(STAGE_IDS).size).toBe(9);
  });

  test("every stage reads only stages that come before it in the list", () => {
    // Not required by the schema — a DAG can be listed in any order — but the
    // list is what the research screen renders as progress rows, and rows that
    // depend on a later row read as a mistake.
    const seen = new Set<string>();
    for (const stage of DEFAULT_PIPELINE.stages) {
      for (const read of stage.reads) {
        expect([stage.id, read, seen.has(read)]).toEqual([
          stage.id,
          read,
          true,
        ]);
      }
      seen.add(stage.id);
    }
  });
});

describe("the tier lists", () => {
  test("all three tiers are populated", () => {
    for (const [tier, candidates] of Object.entries(TIER_CANDIDATES)) {
      expect([tier, candidates.length > 0]).toEqual([tier, true]);
    }
  });

  test("a tier lists no id twice", () => {
    for (const [tier, candidates] of Object.entries(TIER_CANDIDATES)) {
      expect([tier, new Set(candidates).size]).toEqual([
        tier,
        candidates.length,
      ]);
    }
  });

  test("every typed stage ships at balanced, not cheap", () => {
    // §4/S1's conservative default: the table ships so that the pipeline is
    // correct if no cheap model accepts a strict schema and merely more
    // expensive than necessary if one does. WP-X0 moves them down if the
    // measurement allows it. Asserted over the set rather than by name, so a
    // typed stage added at `cheap` fails here instead of shipping.
    const cheap = DEFAULT_PIPELINE.stages
      .filter((stage) => stage.typed && stage.tier !== "balanced")
      .map((stage) => stage.id);
    expect(cheap).toEqual([]);
  });

  test("the story is the one strong-tier stage", () => {
    // A tier declares how much a mistake at this stage costs, and a bad story
    // is the session. It was two — `revise` ran at `strong` as well, so a
    // revision that made the prose worse cost the session twice.
    const strong = DEFAULT_PIPELINE.stages
      .filter((stage) => stage.tier === "strong")
      .map((stage) => stage.id);
    expect(strong).toEqual(["story"]);
  });
});
