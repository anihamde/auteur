import type { FitMeasure } from "@auteur/core/fit";
import type { DialogueMarker, ProsodyTarget } from "@auteur/core/prosody";
import { dialogueRatio } from "@auteur/prosody/dialogue";
import { latinateRatio } from "@auteur/prosody/latinate";
import { latinateGate } from "@auteur/prosody/latinate-gate";
import { distribution, sentenceLengths } from "@auteur/prosody/lengths";
import { MATTR_WINDOW, mattr } from "@auteur/prosody/mattr";
import { punctuationRates } from "@auteur/prosody/punctuation";

/**
 * Live drift, `ARCHITECTURE.md` §6.7.
 *
 * The design's draft screen shows verdicts updating while the prose streams, at
 * flash length under `single-call` — where `critique` has not run and will not
 * until the draft is complete. **So live drift is a deterministic measurement,
 * not a stage**: it costs no tokens, involves no model, and reuses the identical
 * metric functions the card and the report use, which is the only reason its
 * numbers are comparable to theirs.
 */

/** Below this, a type-token ratio is a fact about length, not about style. */
export const MATTR_MIN_WORDS = MATTR_WINDOW;

export type DriftInput = {
  readonly text: string;
  readonly target: ProsodyTarget;
  readonly marker: DialogueMarker;
};

const bandFor = (value: number): [number, number] => [
  value * 0.85,
  value * 1.15,
];

const measure = (
  path: string,
  label: string,
  value: number,
  targetValue: number,
): FitMeasure => {
  const band = bandFor(targetValue);
  return {
    band,
    bandBasis: "range",
    corpusValue: targetValue,
    label,
    path,
    status: value >= band[0] && value <= band[1] ? "pass" : "drift",
    targetOrigin: "measured",
    targetValue,
    value,
  };
};

/**
 * Measure the accumulated draft against the resolved target.
 *
 * Two measures are suppressed while the draft is short, and both suppressions
 * are about the same thing — a number that is a fact about length rather than
 * about style:
 *
 * - **`mattr` until 1,000 words.** The window is 1,000; below it the measure is
 *   computed over the whole text and is not comparable to a corpus figure.
 * - **`dialogueRatio` until the marker convention has appeared at all.**
 *   Showing 0.0 as a `pass` against a target of 0.08 after two paragraphs is a
 *   verdict about nothing — and worse than nothing, because `pass` is a claim.
 *
 * Suppressed means **absent from the returned list**, not present with a null.
 * A measure the UI has to know to skip is a measure it will eventually render.
 */
export const measureDrift = (input: DriftInput): FitMeasure[] => {
  // The sentence lengths are computed once and the word count summed from
  // them. This runs on every paragraph boundary of a streaming draft, so a
  // second pass over the text per measure is a second pass per paragraph.
  const perSentence = sentenceLengths(input.text);
  const words = perSentence.reduce((total, length) => total + length, 0);
  const lengths = distribution(perSentence);
  const rates = punctuationRates(input.text);

  const measures: FitMeasure[] = [
    measure(
      "prosodyTarget.sentenceLength.mean",
      "sentence length",
      lengths.mean,
      input.target.sentenceLength.mean,
    ),
    measure(
      "prosodyTarget.punctuation.semicolon",
      "semicolons per 1k",
      rates.semicolon,
      input.target.punctuation.semicolon,
    ),
    measure(
      "prosodyTarget.punctuation.emDash",
      "em dashes per 1k",
      rates.emDash,
      input.target.punctuation.emDash,
    ),
  ];

  if (words >= MATTR_MIN_WORDS) {
    measures.push(
      measure(
        "prosodyTarget.mattr",
        "type-token ratio",
        mattr(input.text).value,
        input.target.mattr,
      ),
    );
  }

  const dialogue = dialogueRatio(input.text, input.marker);
  // Suppressed until the convention has **appeared**, which is what a ratio of
  // zero means here: no marked speech has been written yet. `dialogueRatio`
  // returns `undefined` only when the corpus marker itself was unmeasurable,
  // which is a different absence and is also suppressed.
  //
  // The two are one condition rather than two branches because the rendering
  // is the same either way: the measure is absent. What must not happen is
  // showing 0.0 as a `pass` against a target of 0.08 after two paragraphs —
  // `pass` is a claim, and there is nothing to claim it about yet.
  if (dialogue.value !== undefined && dialogue.value > 0) {
    measures.push(
      measure(
        "prosodyTarget.dialogueRatio",
        "dialogue ratio",
        dialogue.value,
        input.target.dialogueRatio,
      ),
    );
  }

  const gate = latinateGate();
  if (gate.scored) {
    measures.push({
      ...measure(
        "prosodyTarget.latinateRatio",
        "latinate ratio",
        latinateRatio(input.text),
        input.target.latinateRatio,
      ),
      // The one measure carrying a classifier block, so the UI renders
      // "(suffix proxy, unvalidated)" beside the verdict rather than a bare
      // number a reader would take for a measurement of the same kind.
      classifier: {
        kind: "suffix-proxy",
        validated: gate.validated,
        ...(gate.precision !== undefined && { precision: gate.precision }),
      },
    });
  }

  return measures;
};
