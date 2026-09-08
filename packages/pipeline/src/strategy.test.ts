import { describe, expect, test } from "bun:test";
import type { LengthPreset } from "@auteur/core/session";
import {
  estimateTokens,
  INVOCATION_BUDGET_SECONDS,
  resolveStrategy,
  SAFETY,
  TOKENS_PER_WORD,
} from "./strategy.ts";

const PRESETS: readonly LengthPreset[] = [
  "flash",
  "short",
  "long",
  "novelette",
];
const CEILINGS = [4_000, 32_000, 128_000] as const;

describe("the table over presets and ceilings", () => {
  const rows = PRESETS.flatMap((preset) =>
    CEILINGS.map((ceiling) => [preset, ceiling] as const),
  );

  test.each(rows)("%s at %i output tokens", (preset, ceiling) => {
    const decision = resolveStrategy({
      lengthPreset: preset,
      maxOutputTokens: ceiling,
      // A generous rate, so this row isolates the token ceiling.
      tokensPerSecond: 10_000,
    });
    const fits = estimateTokens(decision.wordTarget) <= ceiling;
    expect([preset, ceiling, decision.strategy]).toEqual([
      preset,
      ceiling,
      fits ? "single-call" : "sequential-scene",
    ]);
  });
});

describe("the duration ceiling is the one that is easy to miss", () => {
  test("a preset whose tokens fit but whose duration does not is sequential", () => {
    // §5.3's clause. The call is legal, the model is capable, and the
    // invocation is killed part-way through with a truncated story and no
    // error. Checking both is what keeps the platform and the strategy from
    // disagreeing.
    const decision = resolveStrategy({
      lengthPreset: "long",
      maxOutputTokens: 200_000,
      tokensPerSecond: 40,
    });
    expect(decision.estimatedTokens).toBeLessThan(200_000);
    expect(decision.estimatedSeconds).toBeGreaterThan(
      INVOCATION_BUDGET_SECONDS,
    );
    expect(decision.strategy).toBe("sequential-scene");
    expect(decision.reason).toBe("duration");
  });

  test("the same length on a faster stream stays single-call", () => {
    expect(
      resolveStrategy({
        lengthPreset: "long",
        maxOutputTokens: 200_000,
        tokensPerSecond: 10_000,
      }).strategy,
    ).toBe("single-call");
  });

  test("the token ceiling is reported when it is the binding one", () => {
    const decision = resolveStrategy({
      lengthPreset: "novelette",
      maxOutputTokens: 4_000,
      tokensPerSecond: 10_000,
    });
    expect(decision.reason).toBe("tokens");
  });
});

describe("the constants are named, and the estimate is conservative", () => {
  test("a word is not a token, and the ratio errs high", () => {
    // Under-estimating produces the failure this module exists to prevent.
    expect(TOKENS_PER_WORD).toBeGreaterThan(1);
    expect(SAFETY).toBeGreaterThan(1);
    expect(estimateTokens(1000)).toBe(
      Math.ceil(1000 * TOKENS_PER_WORD * SAFETY),
    );
  });

  test("the headroom means a story 10% over target still fits", () => {
    // A strategy chosen at exactly the ceiling turns an ordinary overrun into
    // a truncation.
    const ceiling = estimateTokens(1000);
    expect(
      resolveStrategy({
        lengthPreset: "flash",
        maxOutputTokens: ceiling,
        tokensPerSecond: 10_000,
      }).strategy,
    ).toBe("single-call");
    expect(ceiling).toBeGreaterThan(1000 * TOKENS_PER_WORD);
  });
});

describe("the decision carries the resolved strategy", () => {
  test("the caller reads it rather than inferring from the preset", () => {
    // A caller that read the preset and inferred the strategy would be a
    // second implementation of this rule, and the two would disagree the first
    // time a model's ceiling moved.
    const decision = resolveStrategy({
      lengthPreset: "flash",
      maxOutputTokens: 100,
    });
    expect(decision.strategy).toBe("sequential-scene");
    expect(decision.wordTarget).toBe(1000);
  });
});
