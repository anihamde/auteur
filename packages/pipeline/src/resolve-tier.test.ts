import { describe, expect, test } from "bun:test";
import { DEFAULT_PIPELINE } from "@auteur/config/stages";
import { TIER_CANDIDATES } from "@auteur/config/tiers";
import type { Stage } from "@auteur/core/pipeline";
import type { ModelDescriptor } from "@auteur/model-provider/descriptor";
import { CATALOGUE, toDescriptor } from "@auteur/provider-router/models";
import { requirementsFor, resolveAll, resolveTier } from "./resolve-tier.ts";

const CATALOG = CATALOGUE.map((row) => toDescriptor(row));

const model = (overrides: Partial<ModelDescriptor> = {}): ModelDescriptor => ({
  contextWindow: 200_000,
  creator: "Test",
  displayName: "Test",
  id: "test",
  maxOutputTokens: 32_000,
  pricing: { inputPerMillion: 1, outputPerMillion: 1 },
  providerId: "router",
  structuredOutput: true,
  ...overrides,
});

const stage = (overrides: Partial<Stage> = {}): Stage => ({
  id: "outline",
  promptId: "outline",
  reads: [],
  role: "outline",
  streams: false,
  tier: "balanced",
  typed: true,
  ...overrides,
});

describe("the requirement comes from the stage, and from the strategy", () => {
  test("a typed stage needs strict structured output", () => {
    expect(requirementsFor(stage())).toEqual({ structuredOutput: true });
  });

  test("an untyped stage needs nothing of the schema", () => {
    expect(requirementsFor(stage({ typed: false }))).toEqual({});
  });

  test("the output ceiling is passed in, not read from the stage", () => {
    // It is a property of the resolved strategy, not of the stage definition:
    // `draft` needs 20k tokens under single-call and 3k under
    // sequential-scene, and only strategy.ts knows which.
    expect(requirementsFor(stage({ typed: false }), 30_000)).toEqual({
      minOutputTokens: 30_000,
    });
  });
});

describe("resolution takes the first eligible candidate", () => {
  test("it skips a model the catalogue does not carry, and says so", () => {
    // Not an error on its own: a gateway drops a model and the next candidate
    // takes over, which is what an ordered list is for.
    const resolved = resolveTier({
      candidates: ["gone", "test"],
      catalogue: [model()],
      stage: stage(),
      tier: "balanced",
    });
    expect(resolved.model.id).toBe("test");
    expect(resolved.skipped[0]).toEqual({
      id: "gone",
      reason: "the catalogue does not carry it",
    });
  });

  test("it skips a model that cannot meet the stage's requirements", () => {
    const resolved = resolveTier({
      candidates: ["untyped", "typed"],
      catalogue: [
        model({ id: "untyped", structuredOutput: false }),
        model({ id: "typed" }),
      ],
      stage: stage(),
      tier: "balanced",
    });
    expect(resolved.model.id).toBe("typed");
    expect(resolved.skipped[0]?.reason).toContain("strict json_schema");
  });

  test("order is the list's, not the catalogue's", () => {
    const resolved = resolveTier({
      candidates: ["second", "first"],
      catalogue: [model({ id: "first" }), model({ id: "second" })],
      stage: stage(),
      tier: "balanced",
    });
    expect(resolved.model.id).toBe("second");
  });
});

describe("a tier with no eligible candidate fails at startup", () => {
  test("naming the tier, the stage, and every candidate's reason", () => {
    // §6.4 is explicit that the answer is not a JSON-repair loop: that is a
    // second code path whose failures look like model quality problems. So a
    // session that would have failed on its sixth stage fails before its
    // first.
    try {
      resolveTier({
        candidates: ["a", "b"],
        catalogue: [
          model({ id: "a", structuredOutput: false }),
          model({ id: "b", structuredOutput: false }),
        ],
        stage: stage(),
        tier: "cheap",
      });
      throw new Error("should have thrown");
    } catch (thrown) {
      const error = thrown as {
        code?: string;
        message: string;
        detail?: { candidates?: unknown[] };
      };
      expect(error.code).toBe("model_unavailable");
      expect(error.message).toContain("cheap");
      expect(error.message).toContain("outline");
      expect(error.detail?.candidates).toHaveLength(2);
    }
  });

  test("a stage whose output ceiling no candidate meets fails the same way", () => {
    expect(() =>
      resolveTier({
        candidates: ["small"],
        catalogue: [model({ id: "small", maxOutputTokens: 4000 })],
        minOutputTokens: 30_000,
        stage: stage({ typed: false }),
        tier: "strong",
      }),
    ).toThrow("No model in the strong tier");
  });

  test("resolveAll reports every failing stage, not the first", () => {
    try {
      resolveAll(
        DEFAULT_PIPELINE.stages,
        { balanced: [], cheap: [], strong: [] },
        CATALOG,
      );
      throw new Error("should have thrown");
    } catch (thrown) {
      const failures = (thrown as { detail?: { failures?: string[] } }).detail
        ?.failures;
      // Seven stages carry a tier.
      expect(failures).toHaveLength(7);
    }
  });
});

describe("the real config resolves against the real catalogue", () => {
  test("every model stage resolves", () => {
    const resolved = resolveAll(
      DEFAULT_PIPELINE.stages,
      TIER_CANDIDATES,
      CATALOG,
    );
    expect(resolved.size).toBe(7);
  });

  test("a deterministic stage is not in the map", () => {
    const resolved = resolveAll(
      DEFAULT_PIPELINE.stages,
      TIER_CANDIDATES,
      CATALOG,
    );
    expect(resolved.has("prosody-compute")).toBe(false);
  });

  test("every candidate id the config lists exists in the catalogue", () => {
    // A list naming a model nobody carries resolves past it silently, which is
    // right at run time and wrong in a config nobody has checked.
    const known = new Set(CATALOG.map((entry) => entry.id));
    for (const [tier, candidates] of Object.entries(TIER_CANDIDATES)) {
      for (const id of candidates) {
        expect([tier, id, known.has(id)]).toEqual([tier, id, true]);
      }
    }
  });

  test("every typed stage resolves to a model that accepts a strict schema", () => {
    const resolved = resolveAll(
      DEFAULT_PIPELINE.stages,
      TIER_CANDIDATES,
      CATALOG,
    );
    for (const entry of DEFAULT_PIPELINE.stages) {
      if (!entry.typed || entry.tier === undefined) continue;
      expect([
        entry.id,
        resolved.get(entry.id)?.model.structuredOutput,
      ]).toEqual([entry.id, true]);
    }
  });
});
