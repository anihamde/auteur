import { describe, expect, test } from "bun:test";
import type { FetchedWork } from "./fetch.ts";
import {
  insideMargins,
  MARGIN,
  MAX_WORDS,
  MIN_WORDS,
  selectPassages,
  spread,
} from "./passages.ts";

/** Paragraphs of roughly `words` words each, so the cut ladder has boundaries. */
const prose = (paragraphs: number, words = 120): string =>
  Array.from({ length: paragraphs }, (_, index) =>
    Array.from(
      { length: words },
      (_, word) => `w${index.toString()}x${word.toString()}`,
    ).join(" "),
  ).join("\n\n");

const work = (id: string, text: string): FetchedWork => ({
  cleanerVersion: "clean-test",
  id,
  sourceUrl: `https://x/${id}`,
  text,
  title: id,
  translator: null,
  wordCount: text.split(/\s+/).length,
});

describe("the margins exclude both ends, not just the start", () => {
  test("a window that starts inside but ends past the boundary is excluded", () => {
    // The failure this catches: a window beginning at 94% ends past the
    // boundary, so the excluded ending is in the corpus anyway and the margin
    // has done nothing.
    const kept = insideMargins(
      [
        { end: 99, start: 90, text: "", words: 1 },
        { end: 60, start: 20, text: "", words: 1 },
      ],
      100,
    );
    expect(kept.map((window) => window.start)).toEqual([20]);
  });

  test("a window in the leading margin is excluded", () => {
    expect(
      insideMargins([{ end: 40, start: 2, text: "", words: 1 }], 100),
    ).toEqual([]);
  });

  test("the margin is five per cent at each end", () => {
    expect(MARGIN).toBeCloseTo(0.05, 5);
  });
});

describe("spread takes evenly, not randomly", () => {
  test("the same input yields the same output, with no seed to carry", () => {
    // A card whose passages moved between builds would have a different
    // buildKey for the same inputs, so a rebuild would never be a cache hit.
    const items = Array.from({ length: 100 }, (_, index) => index);
    expect(spread(items, 5)).toEqual(spread(items, 5));
  });

  test("it spans the input rather than clustering at one end", () => {
    const items = Array.from({ length: 100 }, (_, index) => index);
    const taken = spread(items, 5);
    expect(Math.min(...taken)).toBeLessThan(20);
    expect(Math.max(...taken)).toBeGreaterThan(70);
  });

  test("fewer items than asked for yields all of them", () => {
    expect(spread([1, 2], 10)).toEqual([1, 2]);
  });
});

describe("passage selection", () => {
  const corpus = Array.from({ length: 12 }, (_, index) =>
    work(`gutenberg:${index.toString()}`, prose(40)),
  );

  test("the same work yields byte-identical passages across two runs", () => {
    // Deterministic segmentation is what makes a cached card comparable to a
    // draft measured later.
    const first = selectPassages(corpus);
    const second = selectPassages(corpus);
    expect(first.map((passage) => passage.text)).toEqual(
      second.map((passage) => passage.text),
    );
    expect(first.map((passage) => passage.charStart)).toEqual(
      second.map((passage) => passage.charStart),
    );
  });

  test("roughly forty candidates come out of a twelve-work corpus", () => {
    const selected = selectPassages(corpus);
    expect(selected.length).toBeGreaterThanOrEqual(24);
    expect(selected.length).toBeLessThanOrEqual(48);
  });

  test("every passage is within the word bounds the cut ladder was given", () => {
    for (const passage of selectPassages(corpus)) {
      const words = passage.text.trim().split(/\s+/).length;
      expect([words >= MIN_WORDS, words <= MAX_WORDS]).toEqual([true, true]);
    }
  });

  test("no passage overlaps the excluded margins", () => {
    const single = [work("gutenberg:1", prose(60))];
    const length = single[0]?.text.length ?? 0;
    for (const passage of selectPassages(single)) {
      expect(passage.charStart).toBeGreaterThanOrEqual(
        Math.floor(length * MARGIN),
      );
      expect(passage.charEnd).toBeLessThanOrEqual(
        Math.ceil(length * (1 - MARGIN)),
      );
    }
  });

  test("the passage text is the slice its offsets name", () => {
    // A citation resolves by id and renders by offset. If the two disagreed, an
    // exemplar would quote text the work does not contain at that position.
    const single = [work("gutenberg:1", prose(40))];
    const text = single[0]?.text ?? "";
    for (const passage of selectPassages(single)) {
      expect(passage.text).toBe(text.slice(passage.charStart, passage.charEnd));
    }
  });

  test("a work too short to yield a window contributes none, rather than a short one", () => {
    // Visible in perWork rather than hidden: a 200-word passage measured
    // against a 900-word band is a number that means nothing.
    expect(selectPassages([work("gutenberg:short", prose(1, 50))])).toEqual([]);
  });

  test("an empty corpus selects nothing", () => {
    expect(selectPassages([])).toEqual([]);
  });

  test("each passage names the work it came from", () => {
    const selected = selectPassages(corpus);
    expect(new Set(selected.map((passage) => passage.workId)).size).toBe(12);
  });
});
