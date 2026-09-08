import { describe, expect, test } from "bun:test";
import type { FitStatus } from "@auteur/core/fit";
import {
  bandFor,
  DRIFT_MULTIPLE,
  MIN_POINTS_FOR_IQR,
  verdictFor,
} from "./bands.ts";

describe("the basis depends on how many points there are", () => {
  test("a card from twelve works records iqr", () => {
    const points = Array.from({ length: 12 }, (_, index) => index + 1);
    expect(bandFor(points).basis).toBe("iqr");
  });

  test("a card from three works records range, and the report says so", () => {
    // Four is the smallest sample where Q1 and Q3 fall between distinct order
    // statistics. With three, the "interquartile range" is an interpolation
    // between the same two numbers the range already gives, dressed up as a
    // statistic.
    const band = bandFor([10, 20, 30]);
    expect(band.basis).toBe("range");
    expect(band.band).toEqual([10, 30]);
  });

  test("the threshold is four", () => {
    expect(MIN_POINTS_FOR_IQR).toBe(4);
    expect(bandFor([1, 2, 3, 4]).basis).toBe("iqr");
  });

  test("no points is a zero band rather than a crash", () => {
    expect(bandFor([])).toEqual({ band: [0, 0], basis: "range" });
  });

  test("the band does not depend on the order the points arrive in", () => {
    expect(bandFor([4, 1, 3, 2]).band).toEqual(bandFor([1, 2, 3, 4]).band);
  });
});

describe("the three verdicts, at each boundary", () => {
  const band = [10, 20] as const;
  // width 10, so drift reaches 1.5 × 10 = 15 either side.

  const CASES: readonly [string, number, FitStatus][] = [
    ["at the low edge", 10, "pass"],
    ["at the high edge", 20, "pass"],
    ["inside", 15, "pass"],
    ["just below the band", 9.9, "drift"],
    ["at the drift limit below", 10 - 15, "drift"],
    ["past the drift limit below", 10 - 15.1, "fail"],
    ["just above the band", 20.1, "drift"],
    ["at the drift limit above", 20 + 15, "drift"],
    ["past the drift limit above", 20 + 15.1, "fail"],
  ];

  test.each(CASES)("%s", (_name, value, expected) => {
    expect(verdictFor(value, band)).toBe(expected);
  });

  test("one constant, and it is the reason there are four statuses", () => {
    // A binary in-or-out verdict makes every near miss look like a failure,
    // and the design's own ProsodyStat union already has four values.
    expect(DRIFT_MULTIPLE).toBe(1.5);
  });
});

describe("a zero-width band still separates the verdicts", () => {
  test("a corpus identical across every work does not make everything fail", () => {
    // It happens routinely — a single-work corpus, or a punctuation rate the
    // same in every work — and with a width of zero every value outside would
    // be `fail`, turning "identical across the corpus" into "impossible to
    // satisfy".
    const band = [10, 10] as const;
    expect(verdictFor(10, band)).toBe("pass");
    expect(verdictFor(10.5, band)).toBe("drift");
    expect(verdictFor(50, band)).toBe("fail");
  });

  test("a zero-valued zero-width band still has a tolerance", () => {
    // Otherwise a corpus measuring 0 for a punctuation mark makes every draft
    // that uses it once a failure.
    expect(verdictFor(0.5, [0, 0])).toBe("drift");
    expect(verdictFor(50, [0, 0])).toBe("fail");
  });
});
