import { describe, expect, test } from "bun:test";
import { latinateGate } from "@auteur/prosody/latinate-gate";
import { cardWith, corpusBlock, workProsody } from "./fixtures.ts";
import { measuresFor, scoredMeasures } from "./measures.ts";

const card = cardWith(corpusBlock());
const measures = measuresFor({ card, draft: workProsody() });
const paths = measures.map((measure) => measure.path);

describe("the scored set asks the gate rather than counting", () => {
  test("the count follows latinateGate, so the two cannot disagree", () => {
    // Five measures now, four if WP-X0 demotes the latinate ratio, with no
    // edit here and none in this test. A test that hardcoded five would have
    // to be edited by the same PR, and the two could then disagree — which is
    // exactly what a gate exists to prevent.
    const expected = latinateGate().scored ? 7 : 6;
    expect(scoredMeasures()).toHaveLength(expected);
    expect(measures).toHaveLength(expected);
  });

  test("the latinate measure is present exactly when the gate says scored", () => {
    expect(paths.includes("prosody.latinateRatio")).toBe(latinateGate().scored);
  });
});

describe("what is scored and what is evidence", () => {
  test("the punctuation marks are scored separately", () => {
    // PRD §10's list: semicolon, em dash and colon each get a verdict, because
    // an author who uses two of the three heavily and the third never is not
    // described by their average.
    expect(paths).toContain("prosody.punctuation.semicolon");
    expect(paths).toContain("prosody.punctuation.emDash");
    expect(paths).toContain("prosody.punctuation.colon");
  });

  test("commonBigrams is absent: a lexicon is not a measure", () => {
    expect(paths.some((path) => path.includes("Bigram"))).toBe(false);
  });

  test("paragraphLength is absent: a beat sheet decides it, not a voice", () => {
    // Scoring it would report the outline's shape as the author's.
    expect(paths.some((path) => path.includes("paragraph"))).toBe(false);
  });

  test("the exclamation and question rates are not scored either", () => {
    expect(paths.some((path) => path.includes("exclamation"))).toBe(false);
    expect(paths.some((path) => path.includes("question"))).toBe(false);
  });
});

describe("only the latinate measure carries a classifier", () => {
  test("exactly one, and it is that one", () => {
    // It is the only measure that is a declared proxy rather than a count, so
    // it is the only one whose verdict is never rendered without saying what
    // produced it.
    const withClassifier = measures.filter(
      (measure) => measure.classifier !== undefined,
    );
    expect(withClassifier).toHaveLength(latinateGate().scored ? 1 : 0);
    expect(withClassifier[0]?.path).toBe(
      latinateGate().scored ? "prosody.latinateRatio" : undefined,
    );
  });

  test("it carries the validation state, not just the kind", () => {
    const latinate = measures.find(
      (measure) => measure.path === "prosody.latinateRatio",
    );
    expect(latinate?.classifier).toEqual({
      kind: "suffix-proxy",
      validated: false,
    });
  });
});

describe("every target is measured in v1", () => {
  test("nothing writes an overlay, so the report keeps one basis", () => {
    // §4.6. The draft prompt carries the precedence clause instead of the
    // pipeline moving a target three stages before anyone can see whether the
    // move was necessary.
    for (const measure of measures) {
      expect([measure.path, measure.targetOrigin]).toEqual([
        measure.path,
        "measured",
      ]);
      expect([measure.path, measure.targetValue]).toEqual([
        measure.path,
        measure.corpusValue,
      ]);
    }
  });
});

describe("the band comes from perWork", () => {
  test("a twelve-work corpus scores against an interquartile band", () => {
    // Which is why perWork is stored rather than just the aggregate: without
    // it there is one point per measure and no band at all.
    for (const measure of measures) {
      expect([measure.path, measure.bandBasis]).toEqual([measure.path, "iqr"]);
      expect(measure.band[0]).toBeLessThan(measure.band[1]);
    }
  });

  test("a three-work corpus scores against a range and says so", () => {
    const small = measuresFor({
      card: cardWith(corpusBlock(3)),
      draft: workProsody(),
    });
    for (const measure of small) {
      expect([measure.path, measure.bandBasis]).toEqual([
        measure.path,
        "range",
      ]);
    }
  });

  test("sentence length can score against the corpus's own sentences", () => {
    // Twelve per-work means have had their spread averaged out of them, so a
    // band built from them is far too narrow and every draft reads as drift.
    const fromMeans = measuresFor({ card, draft: workProsody() })[0];
    const fromSentences = measuresFor({
      card,
      corpusSentenceLengths: Array.from(
        { length: 400 },
        (_, index) => 5 + (index % 60),
      ),
      draft: workProsody(),
    })[0];
    if (fromMeans === undefined || fromSentences === undefined) {
      throw new Error("no measure");
    }
    const widthOf = (measure: typeof fromMeans): number =>
      measure.band[1] - measure.band[0];
    expect(widthOf(fromSentences)).toBeGreaterThan(widthOf(fromMeans));
  });
});

describe("the verdict compares the draft to the corpus", () => {
  test("a draft matching the corpus mean passes", () => {
    const matching = measuresFor({
      card,
      draft: workProsody({
        sentenceLength: {
          mean: 28,
          median: 26,
          p10: 9,
          p90: 52,
          stdev: 14.2,
        },
      }),
    })[0];
    expect(matching?.status).toBe("pass");
  });

  test("a draft far outside the band fails", () => {
    const far = measuresFor({
      card,
      draft: workProsody({
        sentenceLength: { mean: 6, median: 6, p10: 3, p90: 9, stdev: 2 },
      }),
    })[0];
    expect(far?.status).toBe("fail");
  });
});
