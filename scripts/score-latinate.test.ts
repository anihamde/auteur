import { describe, expect, test } from "bun:test";
import {
  PRECISION_THRESHOLD,
  readLabelled,
  renderVerdict,
  verdictFor,
} from "./score-latinate.ts";

const file = (types: unknown[]): unknown => ({ types });

describe("an unfinished labelling file is refused, not partially scored", () => {
  test("a null label stops the run and says how many are missing", () => {
    // Skipping would score the classifier against whichever rows a person
    // happened to reach, and report that as the precision of the whole set.
    const result = readLabelled(
      file([
        { latinate: true, type: "consideration" },
        { latinate: null, type: "harbour" },
      ]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toContain("1 of 2");
    expect(result.problem).toContain("harbour");
  });

  test("a file with no rows is refused rather than scoring 0", () => {
    const result = readLabelled(file([]));
    expect(result.ok).toBe(false);
  });

  test("a file with no types array is refused", () => {
    expect(readLabelled({}).ok).toBe(false);
  });

  test("a fully labelled file is accepted", () => {
    const result = readLabelled(
      file([
        { latinate: true, type: "consideration" },
        { latinate: false, type: "harbour" },
      ]),
    );
    expect(result.ok).toBe(true);
  });
});

describe("the branch is written before the number is known", () => {
  test("precision at the threshold keeps the measure", () => {
    // Exactly 0.85 keeps it: §4.3 says at or above, and a boundary written the
    // other way would demote on the one value the document names. Every word
    // below is one the classifier calls Latinate; what varies is the label, so
    // the ratio is seventeen true positives to three false ones.
    const called = [
      "consideration",
      "illumination",
      "population",
      "operation",
      "narration",
      "dedication",
      "situation",
      "education",
      "relation",
      "creation",
      "vibration",
      "location",
      "duration",
      "rotation",
      "mutation",
      "donation",
      "citation",
      "station",
      "caution",
      "auction",
    ];
    const labelled = called.map((type, index) => ({
      latinate: index < 17,
      type,
    }));
    const verdict = verdictFor(labelled);
    expect(verdict.precision).toBeCloseTo(0.85, 5);
    expect(verdict.keep).toBe(true);
  });

  test("below the threshold demotes it", () => {
    const verdict = verdictFor([
      { latinate: true, type: "consideration" },
      { latinate: false, type: "illumination" },
      { latinate: false, type: "population" },
    ]);
    expect(verdict.precision).toBeLessThan(PRECISION_THRESHOLD);
    expect(verdict.keep).toBe(false);
  });

  test("the report names the consequence rather than only the number", () => {
    // Whoever runs this has to write decision 0003; the output says which of
    // the two it is.
    const kept = renderVerdict(
      { keep: true, precision: 0.91, recall: 0.8 },
      500,
    );
    expect(kept).toContain("stays a scored measure");
    expect(kept).toContain("decision 0003");

    const demoted = renderVerdict(
      { keep: false, precision: 0.61, recall: 0.8 },
      500,
    );
    expect(demoted).toContain("demoted out of the scored set");
  });
});
