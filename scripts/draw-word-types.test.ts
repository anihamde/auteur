import { describe, expect, test } from "bun:test";
import { drawTypes, rankTypes, toLabellingFile } from "./draw-word-types.ts";

const corpus = [
  "the lamp turned and the sea did not.",
  "the keeper considered the illumination of the harbour.",
  "consideration of the harbour occupied the keeper.",
].join(" ");

describe("types, not tokens", () => {
  test("each distinct form appears once, however often it occurs", () => {
    // A frequency-weighted sample of tokens is five hundred copies of `the`,
    // which the classifier declines to classify anyway. What matters is how it
    // does on the vocabulary.
    const ranked = rankTypes(corpus);
    expect(ranked.filter((entry) => entry.type === "the")).toHaveLength(1);
    expect(ranked[0]?.type).toBe("the");
    expect(ranked[0]?.count).toBe(7);
  });

  test("ties break alphabetically, so the ranking is reproducible", () => {
    // Without it two runs over the same corpus order equal-frequency types by
    // insertion, and the draw stops being comparable with the one that set the
    // threshold.
    const ranked = rankTypes("beta alpha gamma");
    expect(ranked.map((entry) => entry.type)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  test("rank is 1-based and dense", () => {
    const ranked = rankTypes(corpus);
    expect(ranked.map((entry) => entry.rank)).toEqual(
      ranked.map((_, index) => index + 1),
    );
  });
});

describe("the draw is seeded and stratified", () => {
  test("the same corpus and seed draw the same set", () => {
    const ranked = rankTypes(corpus);
    expect(drawTypes(ranked, 5, 7)).toEqual(drawTypes(ranked, 5, 7));
  });

  test("a different seed draws a different set", () => {
    const ranked = rankTypes(
      Array.from({ length: 400 }, (_, index) => `word${index.toString()}`).join(
        " ",
      ),
    );
    expect(drawTypes(ranked, 20, 1)).not.toEqual(drawTypes(ranked, 20, 2));
  });

  test("it spans the ranking rather than taking the top", () => {
    // Taking the commonest types measures the classifier on the words it has
    // least to say about; a uniform sample of the type list measures it almost
    // entirely on hapax legomena.
    const ranked = rankTypes(
      Array.from({ length: 500 }, (_, index) =>
        `w${index.toString()} `.repeat(500 - index),
      ).join(" "),
    );
    const drawn = drawTypes(ranked, 10);
    const ranks = drawn.map((entry) => entry.rank);
    expect(Math.min(...ranks)).toBeLessThan(60);
    expect(Math.max(...ranks)).toBeGreaterThan(440);
  });

  test("a corpus with fewer types than asked for yields all of them", () => {
    const ranked = rankTypes("one two three");
    expect(drawTypes(ranked, 500)).toHaveLength(3);
  });
});

describe("the file a human labels", () => {
  test("every label is null, so an unlabelled file cannot score", () => {
    // A default of false would score well: most words are not Latinate.
    const file = JSON.parse(
      toLabellingFile(drawTypes(rankTypes(corpus), 5), "corpus.txt"),
    ) as { types: { latinate: unknown }[] };
    expect(file.types.every((entry) => entry.latinate === null)).toBe(true);
  });

  test("it says the labels are hand-applied and warns against tuning to them", () => {
    const file = toLabellingFile(drawTypes(rankTypes(corpus), 3), "corpus.txt");
    expect(file).toContain("HAND-APPLIED");
    expect(file).toContain("report the precision, do not chase it");
  });

  test("it records which corpus it was drawn from", () => {
    expect(toLabellingFile([], "borges-1935-1975.txt")).toContain(
      "borges-1935-1975.txt",
    );
  });
});
