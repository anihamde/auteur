import { describe, expect, test } from "bun:test";
import type { ProsodyTarget } from "@auteur/core/prosody";
import { MATTR_MIN_WORDS, measureDrift } from "./drift.ts";

const TARGET: ProsodyTarget = {
  dialogueRatio: 0.08,
  latinateRatio: 0.34,
  mattr: 0.48,
  punctuation: {
    colon: 2.1,
    ellipsis: 0.4,
    emDash: 8.4,
    exclamation: 0.2,
    question: 1.1,
    semicolon: 11.2,
  },
  sentenceLength: { mean: 28.4, median: 26, p10: 9, p90: 52, stdev: 14.2 },
};

const paragraphs = (count: number, wordsEach = 30): string =>
  Array.from(
    { length: count },
    (_, index) =>
      `${Array.from({ length: wordsEach }, (_, word) => `w${index.toString()}x${word.toString()}`).join(" ")}.`,
  ).join("\n\n");

const pathsOf = (text: string, marker: "double" | "none" = "double") =>
  measureDrift({ marker, target: TARGET, text }).map((entry) => entry.path);

describe("drift is a measurement, not a stage", () => {
  test("it produces measures with no model and no tokens", () => {
    // §6.7. It reuses the identical metric functions the card and the report
    // use, which is the only reason its numbers are comparable to theirs.
    const measures = measureDrift({
      marker: "double",
      target: TARGET,
      text: paragraphs(3),
    });
    expect(measures.length).toBeGreaterThan(0);
    for (const entry of measures) {
      expect(entry.targetOrigin).toBe("measured");
      expect(entry.corpusValue).toBe(entry.targetValue);
    }
  });

  test("the three always-available measures are there from the first paragraph", () => {
    expect(pathsOf(paragraphs(1))).toEqual([
      "prosodyTarget.sentenceLength.mean",
      "prosodyTarget.punctuation.semicolon",
      "prosodyTarget.punctuation.emDash",
      "prosodyTarget.latinateRatio",
    ]);
  });
});

describe("mattr is suppressed below the window", () => {
  test("a short draft has no type-token measure at all", () => {
    // Below 1,000 words the measure is computed over the whole text and is not
    // comparable to a corpus figure — a fact about length, not about style.
    expect(pathsOf(paragraphs(3))).not.toContain("prosodyTarget.mattr");
  });

  test("a long enough draft has one", () => {
    const long = paragraphs(50, Math.ceil(MATTR_MIN_WORDS / 40));
    expect(pathsOf(long)).toContain("prosodyTarget.mattr");
  });

  test("suppressed means absent, not present with a null", () => {
    // A measure the UI has to know to skip is a measure it will eventually
    // render.
    for (const entry of measureDrift({
      marker: "double",
      target: TARGET,
      text: paragraphs(2),
    })) {
      expect(Number.isFinite(entry.value)).toBe(true);
    }
  });
});

describe("dialogueRatio is suppressed until the convention has appeared", () => {
  test("prose with no dialogue has no dialogue measure", () => {
    // Showing 0.0 as a `pass` against a target of 0.08 after two paragraphs is
    // a verdict about nothing — and worse than nothing, because `pass` is a
    // claim.
    expect(pathsOf(paragraphs(3), "none")).not.toContain(
      "prosodyTarget.dialogueRatio",
    );
  });

  test("prose with the marker gets one", () => {
    const withSpeech = `"Come in," he said. ${paragraphs(2)}`;
    expect(pathsOf(withSpeech)).toContain("prosodyTarget.dialogueRatio");
  });
});

describe("the latinate measure carries its classifier", () => {
  test("it is the one measure with a classifier block", () => {
    // So the UI renders "(suffix proxy, unvalidated)" beside the verdict
    // rather than a bare number a reader would take for a measurement of the
    // same kind as the others.
    const measures = measureDrift({
      marker: "double",
      target: TARGET,
      text: paragraphs(3),
    });
    const withClassifier = measures.filter(
      (entry) => entry.classifier !== undefined,
    );
    expect(withClassifier).toHaveLength(1);
    expect(withClassifier[0]?.path).toBe("prosodyTarget.latinateRatio");
    expect(withClassifier[0]?.classifier?.validated).toBe(false);
  });

  test("the scored set asks the gate rather than counting", () => {
    // Demoting the measure is a change in latinate-gate.ts and nowhere else.
    const measures = measureDrift({
      marker: "double",
      target: TARGET,
      text: paragraphs(3),
    });
    expect(measures.some((entry) => entry.path.endsWith("latinateRatio"))).toBe(
      true,
    );
  });
});

describe("a verdict is a band, not an equality", () => {
  test("a value inside the band passes and one outside drifts", () => {
    const measures = measureDrift({
      marker: "double",
      target: TARGET,
      text: paragraphs(3),
    });
    const sentence = measures[0];
    if (sentence === undefined) throw new Error("no measure");
    expect(sentence.band[0]).toBeLessThan(sentence.targetValue);
    expect(sentence.band[1]).toBeGreaterThan(sentence.targetValue);
    expect(["pass", "drift"]).toContain(sentence.status);
  });
});
