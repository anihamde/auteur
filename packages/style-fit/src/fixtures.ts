import type { ProsodyBlock, WorkProsody } from "@auteur/core/prosody";
import type { StyleCard } from "@auteur/core/style-card";

/**
 * A card and a draft measurement, for this package's tests.
 *
 * Not in the package's `exports` map, so it is not part of the public surface.
 * The card is built by hand rather than through `@auteur/style-card` because
 * these tests are about scoring, and going through the builder would make every
 * one of them depend on the builder's schema being satisfied.
 */

export const workProsody = (
  overrides: Partial<WorkProsody> = {},
): WorkProsody => ({
  dialogueRatio: 0.06,
  latinateRatio: 0.34,
  mattr: 0.48,
  paragraphLength: { mean: 92, median: 84 },
  punctuation: {
    colon: 2.1,
    ellipsis: 0.4,
    emDash: 8.4,
    exclamation: 0.2,
    question: 1.1,
    semicolon: 11.2,
  },
  sentenceLength: { mean: 28.4, median: 26, p10: 9, p90: 52, stdev: 14.2 },
  words: 20_000,
  ...overrides,
});

/** Twelve works, spread so the IQR is a real band rather than a point. */
export const corpusBlock = (workCount = 12): ProsodyBlock => {
  const perWork: Record<string, WorkProsody> = {};
  for (let index = 0; index < workCount; index += 1) {
    perWork[`gutenberg:${index.toString()}`] = workProsody({
      dialogueRatio: 0.04 + index * 0.004,
      latinateRatio: 0.3 + index * 0.006,
      mattr: 0.44 + index * 0.006,
      punctuation: {
        colon: 1.6 + index * 0.08,
        ellipsis: 0.4,
        emDash: 7 + index * 0.24,
        exclamation: 0.2,
        question: 1.1,
        semicolon: 9 + index * 0.36,
      },
      sentenceLength: {
        mean: 24 + index * 0.8,
        median: 22 + index * 0.8,
        p10: 9,
        p90: 52,
        stdev: 14.2,
      },
    });
  }
  return {
    ...workProsody({ words: 214_000 }),
    commonBigrams: ["the labyrinth"],
    dialogueMarker: "double",
    perWork,
  };
};

/**
 * A card with just enough of the schema for scoring.
 *
 * Cast rather than parsed, deliberately: these tests are about the report, and
 * a full valid card here would make every one of them a test of
 * `styleCardSchema` as well.
 */
export const cardWith = (block: ProsodyBlock): StyleCard =>
  ({
    id: "b1c9f2e0-0000-7000-8000-abcdefabcdef",
    prosody: block,
    voice: {
      pov: { origin: "derived", value: "first, retrospective" },
    },
  }) as unknown as StyleCard;
