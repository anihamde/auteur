import type { FitMeasure } from "@auteur/core/fit";
import type { ProsodyBlock, WorkProsody } from "@auteur/core/prosody";
import type { StyleCard } from "@auteur/core/style-card";
import { latinateGate } from "@auteur/prosody/latinate-gate";
import { bandFor, verdictFor } from "./bands.ts";

/**
 * The scored set, `ARCHITECTURE.md` §9.1.
 *
 * `PRD.md` §10's list with §4.3's substitution: mean sentence length,
 * punctuation rate — semicolon, em dash and colon, each separately — dialogue
 * ratio, MATTR and the latinate ratio.
 *
 * **The rest of `ProsodyBlock` is evidence for the drafting prompt and is not
 * scored.** `commonBigrams` because it is a lexicon rather than a measure, and
 * `paragraphLength` because a beat sheet decides it more than a voice does.
 * Scoring either would report the outline's shape as the author's.
 */

/**
 * One scored measure: where the number comes from on both sides.
 *
 * `perWork` is what makes a band possible for the one-number-per-work measures,
 * and reading it through a function rather than a path string keeps the two
 * sides — the draft's value and the corpus's points — provably about the same
 * quantity.
 */
type Scored = {
  readonly path: string;
  readonly label: string;
  readonly of: (prosody: WorkProsody) => number;
};

const BASE: readonly Scored[] = [
  {
    label: "sentence length",
    of: (prosody) => prosody.sentenceLength.mean,
    path: "prosody.sentenceLength.mean",
  },
  {
    label: "semicolons per 1k",
    of: (prosody) => prosody.punctuation.semicolon,
    path: "prosody.punctuation.semicolon",
  },
  {
    label: "em dashes per 1k",
    of: (prosody) => prosody.punctuation.emDash,
    path: "prosody.punctuation.emDash",
  },
  {
    label: "colons per 1k",
    of: (prosody) => prosody.punctuation.colon,
    path: "prosody.punctuation.colon",
  },
  {
    label: "dialogue ratio",
    of: (prosody) => prosody.dialogueRatio,
    path: "prosody.dialogueRatio",
  },
  {
    label: "type-token ratio",
    of: (prosody) => prosody.mattr,
    path: "prosody.mattr",
  },
];

const LATINATE: Scored = {
  label: "latinate ratio",
  of: (prosody) => prosody.latinateRatio,
  path: "prosody.latinateRatio",
};

/**
 * The set, asking the gate rather than counting.
 *
 * §4.3's precision gate can demote `latinateRatio` out of the report, and this
 * is the one line that changes when it does. A test that hardcoded five would
 * have to be edited by the same PR, and the two could then disagree — which is
 * exactly what a gate exists to prevent.
 */
export const scoredMeasures = (): readonly Scored[] =>
  latinateGate().scored ? [...BASE, LATINATE] : BASE;

/**
 * Corpus points for one measure.
 *
 * Sentence length is the exception and the reason the two cases exist: its
 * band is the IQR **over the corpus's sentences**, not over twelve per-work
 * means. Twelve means are twelve numbers that have already had their spread
 * averaged out of them, so a band built from them is far too narrow and every
 * draft reads as drift.
 */
const pointsFor = (
  scored: Scored,
  block: ProsodyBlock,
  sentenceLengths?: readonly number[],
): readonly number[] => {
  if (scored.path === "prosody.sentenceLength.mean") {
    return sentenceLengths ?? Object.values(block.perWork).map(scored.of);
  }
  return Object.values(block.perWork).map(scored.of);
};

export type MeasureInput = {
  readonly card: StyleCard;
  /** The draft's own prosody, measured with the same functions. */
  readonly draft: WorkProsody;
  /** The corpus's sentence lengths, when the caller kept them. */
  readonly corpusSentenceLengths?: readonly number[];
};

/**
 * The `FitMeasure[]` for a draft against a card.
 *
 * Every measure's `targetOrigin` is `measured` in v1 (§4.6): nothing writes an
 * overlay, so the target equals the measurement and the report keeps one basis.
 * `edited.ts` is what handles the other case, and it is unreachable in v1 by
 * construction rather than by omission.
 */
export const measuresFor = (input: MeasureInput): FitMeasure[] =>
  scoredMeasures().map((scored) => {
    const points = pointsFor(
      scored,
      input.card.prosody,
      input.corpusSentenceLengths,
    );
    const { band, basis } = bandFor(points);
    const value = scored.of(input.draft);
    const corpusValue = scored.of(input.card.prosody);

    return {
      band: [band[0], band[1]],
      bandBasis: basis,
      corpusValue,
      label: scored.label,
      path: scored.path,
      status: verdictFor(value, band),
      targetOrigin: "measured",
      targetValue: corpusValue,
      value,
      ...(scored.path === "prosody.latinateRatio" && {
        // The one measure that is a declared proxy rather than a count, so the
        // only one whose verdict is never rendered without saying what
        // produced it.
        classifier: {
          kind: "suffix-proxy" as const,
          validated: latinateGate().validated,
        },
      }),
    };
  });
