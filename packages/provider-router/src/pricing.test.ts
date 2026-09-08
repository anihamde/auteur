import { describe, expect, test } from "bun:test";
import type { Pricing } from "@auteur/model-provider/descriptor";
import { costMicros, formatMicros } from "./pricing.ts";

const pricing: Pricing = {
  cachedInputPerMillion: 125_000,
  inputPerMillion: 1_250_000,
  outputPerMillion: 10_000_000,
};

describe("cost is integer micros throughout", () => {
  test("a plain call is input plus output at their own rates", () => {
    expect(
      costMicros({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, pricing),
    ).toBe(11_250_000);
  });

  test("cached tokens are billed at the cached rate, not the fresh one", () => {
    // They are not part of `inputTokens` — the decomposition rule. Adding them
    // in would bill a cache read at ten times its price.
    expect(
      costMicros(
        {
          cachedInputTokens: 1_000_000,
          inputTokens: 0,
          outputTokens: 0,
        },
        pricing,
      ),
    ).toBe(125_000);
  });

  test("a model with no cached rate over-reports rather than inventing a discount", () => {
    // The conservative direction: showing a discount that may not exist is the
    // error that makes an estimate misleading rather than merely imprecise.
    expect(
      costMicros(
        { cachedInputTokens: 1_000_000, inputTokens: 0, outputTokens: 0 },
        { inputPerMillion: 1_250_000, outputPerMillion: 10_000_000 },
      ),
    ).toBe(1_250_000);
  });

  test("the result is always an integer, so a hundred stages sum exactly", () => {
    // A float sum over a session drifts in the last place for no reason
    // anyone can explain to a reader.
    let total = 0;
    for (let call = 0; call < 100; call += 1) {
      total += costMicros({ inputTokens: 1237, outputTokens: 913 }, pricing);
    }
    expect(Number.isInteger(total)).toBe(true);
    expect(total).toBe(
      100 * costMicros({ inputTokens: 1237, outputTokens: 913 }, pricing),
    );
  });

  test("a zero-token call costs zero, not a rounding artefact", () => {
    expect(costMicros({ inputTokens: 0, outputTokens: 0 }, pricing)).toBe(0);
  });
});

describe("formatMicros", () => {
  test("always two decimals, because it is money", () => {
    expect(formatMicros(0)).toBe("$0.00");
    expect(formatMicros(11_250_000)).toBe("$11.25");
    expect(formatMicros(1_500)).toBe("$0.00");
  });
});
