import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { countWords, tokenize } from "./tokenize.ts";

describe("what counts as one token", () => {
  test.each([
    ["don't", ["don't"]],
    ["don’t", ["don’t"]],
    ["well-known", ["well-known"]],
    ["'quoted'", ["quoted"]],
    ["word—word", ["word", "word"]],
    ["one… two", ["one", "two"]],
    ['"Yes," he said.', ["Yes", "he", "said"]],
    ["café naïve Ægypt", ["café", "naïve", "Ægypt"]],
    ["1935 to 1975", ["1935", "to", "1975"]],
    ["—", []],
    ["", []],
  ])("%j tokenizes to %j", (input, expected) => {
    expect(tokenize(input)).toEqual(expected);
  });

  test("a leading or trailing apostrophe is stripped, an internal one is not", () => {
    expect(tokenize("'tis")).toEqual(["tis"]);
    expect(tokenize("o'clock")).toEqual(["o'clock"]);
  });

  test("a trailing hyphen does not join across a line", () => {
    expect(tokenize("half- hearted")).toEqual(["half", "hearted"]);
  });
});

describe("this is not split(/\\s+/), and the difference is measurable", () => {
  const passage =
    '"Yes," he said—quietly, well-known to all—"the comet… it returns."';

  test("whitespace splitting gives a different count on real prose", () => {
    // The whole reason for a real tokenizer. A whitespace split counts
    // `he said—quietly,` as two tokens where this counts three, and every
    // per-1k rate computed from it is wrong by a few percent — enough to move
    // a band verdict and not enough to notice.
    const naive = passage.split(/\s+/).filter(Boolean).length;
    expect(countWords(passage)).not.toBe(naive);
    expect(countWords(passage)).toBeGreaterThan(naive);
  });

  test("punctuation never becomes part of a token", () => {
    for (const token of tokenize(passage)) {
      expect(token).not.toMatch(/[."—…,]/);
    }
  });
});

describe("properties", () => {
  test("count is additive over a separator", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (left, right) => {
        return (
          countWords(`${left} ${right}`) ===
          countWords(left) + countWords(right)
        );
      }),
      { numRuns: 1000 },
    );
  });

  test("doubling a text doubles its word count", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        return countWords(`${text} ${text}`) === 2 * countWords(text);
      }),
      { numRuns: 1000 },
    );
  });

  test("countWords agrees with tokenize().length", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        return countWords(text) === tokenize(text).length;
      }),
      { numRuns: 1000 },
    );
  });
});
