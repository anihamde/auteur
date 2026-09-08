import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { elapsed } from "./elapsed.ts";
import { metaRow } from "./meta-row.ts";
import { money } from "./money.ts";
import { formatCount, pluralize } from "./pluralize.ts";
import { prosodyValue } from "./prosody-value.ts";

describe("pluralize", () => {
  test.each([
    [1, "1 work"],
    [0, "0 works"],
    [12, "12 works"],
    [-1, "-1 works"],
  ])("%i work(s) renders as %s", (count, expected) => {
    expect(pluralize(count, "work")).toBe(expected);
  });

  test("an irregular plural is passed rather than derived", () => {
    expect(pluralize(2, "analysis", "analyses")).toBe("2 analyses");
  });

  test.each([
    [0, "0"],
    [999, "999"],
    [1000, "1,000"],
    [1042, "1,042"],
    [214_000, "214,000"],
    [-1_234_567, "-1,234,567"],
  ])("formatCount(%i) is %s", (count, expected) => {
    expect(formatCount(count)).toBe(expected);
  });
});

describe("elapsed switches form at one minute", () => {
  test.each([
    [0, "0.0s"],
    [1900, "1.9s"],
    [14_500, "14.5s"],
    [59_949, "59.9s"],
    [60_000, "1m 00s"],
    [124_000, "2m 04s"],
    [3_599_000, "59m 59s"],
  ])("%i ms renders as %s", (millis, expected) => {
    expect(elapsed(millis)).toBe(expected);
  });

  test("seconds are zero-padded past the minute mark", () => {
    // The rail is a fixed 236px. A number that reflows while a stage runs reads
    // as a glitch, so the column must not change width.
    expect(elapsed(64_000)).toBe("1m 04s");
    expect(elapsed(64_000)).toHaveLength(6);
    expect(elapsed(74_000)).toHaveLength(6);
  });

  test("a negative duration is clamped rather than rendered", () => {
    expect(elapsed(-5)).toBe("0.0s");
  });

  test("property: elapsed is monotone in its input", () => {
    const rank = (text: string): number =>
      text.includes("m ")
        ? 1e9 + Number.parseFloat(text)
        : Number.parseFloat(text);
    fc.assert(
      fc.property(
        fc.integer({ max: 5_000_000, min: 0 }),
        fc.integer({ max: 5_000_000, min: 0 }),
        (a, b) => {
          if (a >= b) {
            return true;
          }
          return rank(elapsed(a)) <= rank(elapsed(b));
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe("prosodyValue's decimals are a claim about precision", () => {
  test.each([
    [28.44, "words", "28.4 w"],
    [24, "words", "24.0 w"],
    [11.24, "per1k", "11.2/1k"],
    [6.35, "per1k", "6.4/1k"],
    [0.06, "ratio", "0.06"],
    [0.1, "ratio", "0.10"],
    [0.484, "ratio", "0.48"],
  ] as const)("%f as %s renders %s", (value, unit, expected) => {
    expect(prosodyValue(value, unit)).toBe(expected);
  });

  test("a trailing zero is kept, because 0.10 and 0.1 claim different things", () => {
    // Stripping it would be the lie: 0.1 reads as one significant figure on a
    // measurement that has two.
    expect(prosodyValue(0.1, "ratio")).toBe("0.10");
    expect(prosodyValue(24, "words")).toBe("24.0 w");
  });

  test("counts and ratios never share a precision", () => {
    // A sentence length shown to two decimals claims a hundredth of a word.
    expect(prosodyValue(28.444, "words")).toBe("28.4 w");
    expect(prosodyValue(0.084, "ratio")).toBe("0.08");
  });
});

describe("money", () => {
  test.each([
    [40_000, "$0.04"],
    [150_000, "$0.15"],
    [0, "$0.00"],
    [1_000_000, "$1.00"],
    [12_345_678, "$12.35"],
    [-40_000, "-$0.04"],
  ])("%i micros renders as %s", (micros, expected) => {
    expect(money(micros)).toBe(expected);
  });

  test("always two decimals, never more or fewer", () => {
    fc.assert(
      fc.property(fc.integer({ max: 10 ** 9, min: 0 }), (micros) =>
        /^\$\d+\.\d{2}$/.test(money(micros)),
      ),
      { numRuns: 500 },
    );
  });

  test("carries no estimate qualifier of its own", () => {
    // Every money figure auteur shows is an estimate (§10.2), but the qualifier
    // belongs to the surface, which knows how much room it has. Baking it in
    // would repeat it inside a sentence that already said it.
    expect(money(40_000)).not.toContain("est");
  });
});

describe("metaRow", () => {
  test("joins with a middot", () => {
    expect(metaRow(["card@3", "full-text", "confidence 0.86"])).toBe(
      "card@3 · full-text · confidence 0.86",
    );
  });

  test("drops absent and empty parts rather than leaving a hole", () => {
    // A card with no confidence yet must not render `card@3 · full-text · `.
    expect(metaRow(["card@3", undefined, "  ", "full-text"])).toBe(
      "card@3 · full-text",
    );
  });

  test("all-absent is the empty string, not a bare separator", () => {
    expect(metaRow([undefined, undefined])).toBe("");
  });
});

describe("rounding is half-up and predictable, not toFixed's", () => {
  test.each([
    [6.35, "per1k", "6.4/1k"],
    [6.45, "per1k", "6.5/1k"],
    [1.005, "ratio", "1.01"],
    [1.015, "ratio", "1.02"],
    [2.675, "ratio", "2.68"],
    [0.125, "ratio", "0.13"],
    [0.135, "ratio", "0.14"],
  ] as const)("%f as %s renders %s", (value, unit, expected) => {
    // toFixed rounds the binary double, so (6.35).toFixed(1) is "6.3" while
    // (6.45).toFixed(1) is "6.5". Both are defensible; together they are not
    // predictable, and a reader comparing two rates cannot see why one went up
    // and the other down.
    expect(prosodyValue(value, unit)).toBe(expected);
  });

  test("a value genuinely below the midpoint still rounds down", () => {
    // The epsilon nudge corrects representation error, not real distance.
    expect(prosodyValue(6.3499, "per1k")).toBe("6.3/1k");
    expect(prosodyValue(0.1249, "ratio")).toBe("0.12");
  });

  test("property: the rendered value is never more than half a step away", () => {
    fc.assert(
      fc.property(fc.double({ max: 100, min: 0, noNaN: true }), (value) => {
        const rendered = Number.parseFloat(prosodyValue(value, "ratio"));
        return Math.abs(rendered - value) <= 0.005 + Number.EPSILON * 100;
      }),
      { numRuns: 2000 },
    );
  });
});
