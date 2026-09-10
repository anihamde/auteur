import { describe, expect, test } from "bun:test";
import { EXTRACT_PASSAGES, spreadAcross } from "../../server/_stages/card.ts";

/**
 * Which passages the extraction reads, when it cannot read them all.
 *
 * The lists arrive one per work and were concatenated and sliced. That was
 * harmless while the budget exceeded the total, and became a defect the moment
 * the budget was halved: a prefix of a concatenation is the earliest works
 * entire and the later ones not at all — which is exactly what `corpus-select`
 * spends its whole instruction avoiding.
 */

const works = (counts: readonly number[]): string[][] =>
  counts.map((count, work) =>
    Array.from({ length: count }, (_, index) => `w${work}-p${index}`),
  );

describe("every work is represented before any work is exhausted", () => {
  test("the first of each comes before the second of any", () => {
    expect(spreadAcross(works([3, 3, 3]), 6)).toEqual([
      "w0-p0",
      "w1-p0",
      "w2-p0",
      "w0-p1",
      "w1-p1",
      "w2-p1",
    ]);
  });

  test("a twelve-work corpus at the real budget touches all twelve", () => {
    // The defect, at the numbers it actually happens at: twelve works of three
    // passages, a budget of twenty. A prefix would take the first six works
    // and none of the last six — an author's late career dropped from the card.
    const chosen = spreadAcross(works(Array(12).fill(3)), EXTRACT_PASSAGES);
    expect(chosen).toHaveLength(EXTRACT_PASSAGES);
    const touched = new Set(chosen.map((id) => id.split("-")[0]));
    expect(touched.size).toBe(12);
  });
});

describe("the awkward shapes", () => {
  test("a work with fewer passages drops out of later rounds", () => {
    expect(spreadAcross(works([1, 3]), 4)).toEqual([
      "w0-p0",
      "w1-p0",
      "w1-p1",
      "w1-p2",
    ]);
  });

  test("fewer passages than the budget returns all of them, not a padded list", () => {
    expect(spreadAcross(works([2, 1]), 20)).toEqual([
      "w0-p0",
      "w1-p0",
      "w0-p1",
    ]);
  });

  test("no works at all is an empty list rather than a hang", () => {
    // `Math.max()` of nothing is -Infinity, which is the shape of loop that
    // does not terminate if it is written the other way round.
    expect(spreadAcross([], 20)).toEqual([]);
  });

  test("a work with no passages does not stall the rounds", () => {
    expect(spreadAcross(works([0, 2]), 20)).toEqual(["w1-p0", "w1-p1"]);
  });

  test("a budget of zero takes nothing", () => {
    expect(spreadAcross(works([3, 3]), 0)).toEqual([]);
  });
});
