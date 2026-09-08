import { describe, expect, test } from "bun:test";
import type { Pricing } from "@auteur/model-provider/descriptor";
import {
  accountFor,
  cancelledUsage,
  costOf,
  normalise,
  sessionCost,
} from "./usage.ts";

const pricing: Pricing = {
  cachedInputPerMillion: 100_000,
  inputPerMillion: 1_000_000,
  outputPerMillion: 5_000_000,
};

describe("cached input is priced apart and excluded from inputTokens", () => {
  test("a heavily cached prompt costs a fraction of the naive figure", () => {
    // The three-way fixture the plan asks for. On a long session most input is
    // cached, so folding the counts together over-reports by several times —
    // and the error does not surface until a bill.
    const usage = {
      cachedInputTokens: 900_000,
      inputTokens: 100_000,
      outputTokens: 10_000,
    };
    const correct = costOf(usage, pricing);
    const folded = costOf(
      { cachedInputTokens: 0, inputTokens: 1_000_000, outputTokens: 10_000 },
      pricing,
    );
    expect(correct).toBe(100_000 + 90_000 + 50_000);
    expect(folded / correct).toBeGreaterThan(3);
  });

  test("a model with no cached rate over-reports rather than inventing a discount", () => {
    expect(
      costOf(
        { cachedInputTokens: 1_000_000, inputTokens: 0, outputTokens: 0 },
        { inputPerMillion: 1_000_000, outputPerMillion: 5_000_000 },
      ),
    ).toBe(1_000_000);
  });
});

describe("normalising a provider's usage", () => {
  test("an absent cached count becomes zero, not undefined", () => {
    // The row has a column and a report sums it; `undefined + number` is how a
    // total becomes NaN three layers from here.
    expect(normalise({ inputTokens: 10, outputTokens: 2 })).toEqual({
      cachedInputTokens: 0,
      inputTokens: 10,
      outputTokens: 2,
    });
  });
});

describe("cost is computed at write time", () => {
  test("accountFor returns the counts and the cost together", () => {
    const accounted = accountFor(
      { cachedInputTokens: 1000, inputTokens: 2000, outputTokens: 500 },
      pricing,
    );
    expect(accounted.costMicros).toBe(costOf(accounted, pricing));
  });

  test("a session's cost is the sum of what was stored, not a recomputation", () => {
    // A later price change must not rewrite the history of what a session
    // cost. The rail footer's spend is one SUM over stored values.
    const stages = [
      accountFor({ inputTokens: 1000, outputTokens: 100 }, pricing),
      accountFor({ inputTokens: 2000, outputTokens: 200 }, pricing),
    ];
    expect(sessionCost(stages)).toBe(
      (stages[0]?.costMicros ?? 0) + (stages[1]?.costMicros ?? 0),
    );
  });
});

describe("a cancelled stage records what was already billed", () => {
  test("the tokens spent before the cancellation are kept", () => {
    // A cancellation that wrote zeros would make a cancelled session look
    // free, and the reader who cancelled it is exactly the one who wants to
    // know what it cost before they did.
    const usage = cancelledUsage(
      { cachedInputTokens: 500, inputTokens: 1500, outputTokens: 300 },
      pricing,
    );
    expect(usage.inputTokens).toBe(1500);
    expect(usage.costMicros).toBeGreaterThan(0);
  });

  test("a cancellation before any usage arrived is zero, not a crash", () => {
    expect(cancelledUsage(undefined, pricing)).toEqual({
      cachedInputTokens: 0,
      costMicros: 0,
      inputTokens: 0,
      outputTokens: 0,
    });
  });
});
