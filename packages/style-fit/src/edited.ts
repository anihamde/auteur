import type { FitMeasure } from "@auteur/core/fit";
import type { CardOverlay } from "@auteur/core/style-card";
import { bandFor, verdictFor } from "./bands.ts";

/**
 * An edited target is scored **twice**, `ARCHITECTURE.md` §9.3.
 *
 * `PRD.md` §5 is explicit that the report must not score a story against
 * user-invented targets as if they were the author's real statistics. So for
 * any measure whose target was edited, the report carries both verdicts — one
 * against the target, one against the corpus measurement — and the UI shows
 * both with the edited one marked amber.
 *
 * **There is no single-verdict path for an edited measure.** That is the whole
 * point of this module returning a pair rather than a measure with a flag:
 * nothing downstream can render only the flattering one, because there is no
 * shape in which only one exists.
 *
 * **No v1 code path produces one** (§4.6): every target equals its measurement,
 * so this is exercised only by tests with a hand-built overlay. It is here
 * because the schema decision `PRD.md` §5 makes is worthless if the report
 * cannot honour it, and because a report that has never been asked to carry two
 * verdicts is a report that will not when the editing UI lands.
 */

/** Two verdicts for one measure. The type says there are always two. */
export type EditedPair = readonly [FitMeasure, FitMeasure];

export type EditedInput = {
  readonly measure: FitMeasure;
  /** The target the session edited to. */
  readonly editedTarget: number;
  /** The corpus points the band is built from. */
  readonly points: readonly number[];
};

/**
 * The pair: the edited verdict first, then the measured one.
 *
 * Edited first because it is the one the reader chose and the one the amber
 * mark is on; measured second because it is the one that is true about the
 * author. The order is part of the contract — a UI rendering "the first" gets
 * the session's own target, and a report summing "the second" gets the corpus.
 */
export const scoreAgainstEdited = (input: EditedInput): EditedPair => {
  const { band, basis } = bandFor(input.points);
  const shifted: [number, number] = [
    band[0] + (input.editedTarget - input.measure.corpusValue),
    band[1] + (input.editedTarget - input.measure.corpusValue),
  ];

  return [
    {
      ...input.measure,
      band: [shifted[0], shifted[1]],
      bandBasis: basis,
      status: verdictFor(input.measure.value, shifted),
      targetOrigin: "edited",
      targetValue: input.editedTarget,
    },
    {
      ...input.measure,
      band: [band[0], band[1]],
      bandBasis: basis,
      status: verdictFor(input.measure.value, band),
      targetOrigin: "measured",
      targetValue: input.measure.corpusValue,
    },
  ];
};

/**
 * Expand a measure list, doubling every measure the overlay edited.
 *
 * Reads the overlay rather than a flag on the measure, because the overlay is
 * where the edit actually lives — a flag would be a second copy of the fact and
 * the two would disagree the first time a session's overlay was cleared.
 */
export const withEditedTargets = (
  measures: readonly FitMeasure[],
  overlay: CardOverlay | undefined,
  pointsFor: (path: string) => readonly number[],
): FitMeasure[] => {
  if (overlay === undefined) return [...measures];

  return measures.flatMap((measure) => {
    const edited = overlay.fields[measure.path];
    if (edited === undefined || typeof edited.value !== "number") {
      return [measure];
    }
    return [
      ...scoreAgainstEdited({
        editedTarget: edited.value,
        measure,
        points: pointsFor(measure.path),
      }),
    ];
  });
};
