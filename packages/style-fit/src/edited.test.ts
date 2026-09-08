import { describe, expect, test } from "bun:test";
import type { FitMeasure } from "@auteur/core/fit";
import type { CardOverlay } from "@auteur/core/style-card";
import { scoreAgainstEdited, withEditedTargets } from "./edited.ts";
import { cardWith, corpusBlock, workProsody } from "./fixtures.ts";
import { measuresFor } from "./measures.ts";

const card = cardWith(corpusBlock());
const measures = measuresFor({ card, draft: workProsody() });

const sentenceMeasure = measures.find(
  (measure) => measure.path === "prosody.sentenceLength.mean",
) as FitMeasure;

const points = Object.values(card.prosody.perWork).map(
  (work) => work.sentenceLength.mean,
);

const overlay = (fields: Record<string, { origin: string; value: unknown }>) =>
  ({
    cardId: card.id,
    fields,
    sessionId: "c1c9f2e0-0000-7000-8000-abcdefabcdef",
  }) as unknown as CardOverlay;

describe("an edited target is scored twice", () => {
  test("the pair carries both verdicts, edited first", () => {
    // PRD §5: the report must not score a story against user-invented targets
    // as if they were the author's real statistics. Edited first because it is
    // the one the reader chose and the one the amber mark is on.
    const pair = scoreAgainstEdited({
      editedTarget: 24,
      measure: sentenceMeasure,
      points,
    });
    expect(pair).toHaveLength(2);
    expect(pair[0].targetOrigin).toBe("edited");
    expect(pair[1].targetOrigin).toBe("measured");
  });

  test("the measured verdict is against the corpus, unshifted", () => {
    const pair = scoreAgainstEdited({
      editedTarget: 24,
      measure: sentenceMeasure,
      points,
    });
    expect(pair[1].targetValue).toBe(sentenceMeasure.corpusValue);
    expect(pair[1].band).toEqual(sentenceMeasure.band);
  });

  test("the edited verdict's band moves with the target", () => {
    // The band describes a spread, and the spread is the corpus's whatever the
    // target is. Moving the target moves the band with it rather than
    // re-deriving a spread the corpus does not have.
    const pair = scoreAgainstEdited({
      editedTarget: sentenceMeasure.corpusValue - 4,
      measure: sentenceMeasure,
      points,
    });
    expect(pair[0].band[0]).toBeCloseTo(sentenceMeasure.band[0] - 4, 6);
    expect(pair[0].band[1]).toBeCloseTo(sentenceMeasure.band[1] - 4, 6);
  });

  test("the two verdicts can disagree, which is the whole point", () => {
    // A draft at 22 against a corpus of 28.4 and an edited target of 22: pass
    // against the target, drift against the author. Reporting only the first
    // is what §9.3 forbids.
    const draft = { ...sentenceMeasure, value: 22 };
    const pair = scoreAgainstEdited({
      editedTarget: 22,
      measure: draft,
      points,
    });
    expect(pair[0].status).toBe("pass");
    expect(pair[1].status).not.toBe("pass");
  });
});

describe("there is no single-verdict path for an edited measure", () => {
  test("the expansion doubles exactly the edited measures", () => {
    const expanded = withEditedTargets(
      measures,
      overlay({
        "prosody.sentenceLength.mean": { origin: "edited", value: 24 },
      }),
      () => points,
    );
    expect(expanded).toHaveLength(measures.length + 1);
    const sentence = expanded.filter(
      (measure) => measure.path === "prosody.sentenceLength.mean",
    );
    expect(sentence.map((measure) => measure.targetOrigin)).toEqual([
      "edited",
      "measured",
    ]);
  });

  test("no overlay leaves the list untouched", () => {
    // Which is v1: no code path writes an overlay, so this branch is exercised
    // only by these tests.
    expect(withEditedTargets(measures, undefined, () => points)).toEqual(
      measures,
    );
  });

  test("an overlay editing something that is not a measure changes nothing", () => {
    const expanded = withEditedTargets(
      measures,
      overlay({ "voice.pov": { origin: "edited", value: "third" } }),
      () => points,
    );
    expect(expanded).toHaveLength(measures.length);
  });

  test("an overlay whose value is not a number is ignored, not coerced", () => {
    // A target is a number. Coercing "24" would make the report's basis depend
    // on a string parse nobody wrote down.
    const expanded = withEditedTargets(
      measures,
      overlay({
        "prosody.sentenceLength.mean": { origin: "edited", value: "24" },
      }),
      () => points,
    );
    expect(expanded).toHaveLength(measures.length);
  });
});
