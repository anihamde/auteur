import { describe, expect, test } from "bun:test";
import { DEFAULT_PIPELINE, STAGE_IDS } from "./stages.ts";
import { TIER_CANDIDATES } from "./tiers.ts";

describe("the pipeline is data, so an alternative is a config file", () => {
  test("ten stages, and the ids are unique", () => {
    expect(STAGE_IDS).toHaveLength(10);
    expect(new Set(STAGE_IDS).size).toBe(10);
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

  test("corpus-select and critique ship at balanced, not cheap", () => {
    // §4/S1's conservative default: both are typed, and the table ships so
    // that the pipeline is correct if no cheap model accepts a strict schema
    // and merely more expensive than necessary if one does. WP-X0 moves them
    // down if the measurement allows it.
    const tierOf = (id: string) =>
      DEFAULT_PIPELINE.stages.find((stage) => stage.id === id)?.tier;
    expect(tierOf("corpus-select")).toBe("balanced");
    expect(tierOf("critique")).toBe("balanced");
  });

  test("draft and revise are the strong-tier stages", () => {
    // A tier declares how much a mistake at this stage costs. A bad draft is
    // the session; a revision that made the draft worse is the session twice.
    const strong = DEFAULT_PIPELINE.stages
      .filter((stage) => stage.tier === "strong")
      .map((stage) => stage.id);
    expect(strong).toEqual(["draft", "revise"]);
  });
});
