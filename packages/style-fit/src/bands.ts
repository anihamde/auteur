import type { BandBasis, FitStatus } from "@auteur/core/fit";
import { percentile } from "@auteur/prosody/lengths";

/**
 * The band a verdict is scored against, `ARCHITECTURE.md` §9.1.
 *
 * `PRD.md` §10's criterion is the corpus **interquartile** band. For a measure
 * computed over sentences the band is the IQR over the corpus's sentences; for
 * a measure that is one number per work — punctuation rates, dialogue ratio,
 * MATTR, latinate ratio — it is the IQR across `perWork` values. That is why
 * `perWork` is stored rather than just the aggregate: without it there is one
 * point per measure and no band at all.
 */

/**
 * Below this many points a quartile is not a quartile.
 *
 * Four is the smallest sample where Q1 and Q3 fall between distinct order
 * statistics. With three, the "interquartile range" is an interpolation between
 * the same two numbers the range already gives, dressed up as a statistic.
 */
export const MIN_POINTS_FOR_IQR = 4;

/**
 * How far outside the band is still `drift` rather than `fail`.
 *
 * One constant, and the reason it exists: a binary in-or-out verdict makes
 * every near miss look like a failure. The design's own `ProsodyStat` status
 * union already has four values, so the report has somewhere to put a near
 * miss.
 */
export const DRIFT_MULTIPLE = 1.5;

export type Band = {
  readonly band: readonly [number, number];
  readonly basis: BandBasis;
};

/**
 * The band over a set of corpus values.
 *
 * A card built from fewer than four works records `bandBasis: "range"`, and the
 * report says the band is a range rather than an interquartile band — which is
 * the honest label, not a caveat. A three-work card is a real card and its band
 * is a real band; it is simply a different statistic, and a reader comparing
 * two reports needs to know which they are looking at.
 */
export const bandFor = (values: readonly number[]): Band => {
  if (values.length === 0) return { band: [0, 0], basis: "range" };
  const sorted = [...values].sort((left, right) => left - right);

  if (sorted.length < MIN_POINTS_FOR_IQR) {
    return {
      band: [sorted[0] as number, sorted[sorted.length - 1] as number],
      basis: "range",
    };
  }
  return {
    band: [percentile(sorted, 0.25), percentile(sorted, 0.75)],
    basis: "iqr",
  };
};

/**
 * The verdict.
 *
 * `pass` inside the band, `drift` outside it but within 1.5 band widths, `fail`
 * beyond.
 *
 * **A zero-width band still separates the three verdicts.** It happens
 * routinely — a single-work corpus, or a punctuation rate identical across every
 * work — and with a width of zero every value outside the band would be
 * `fail`, which turns "identical across the corpus" into "impossible to
 * satisfy". The tolerance falls back to a fraction of the band's own value, so
 * a corpus that is perfectly consistent is scored against how far the draft is
 * from it rather than against whether it matched exactly.
 */
export const ZERO_WIDTH_TOLERANCE = 0.15;

export const verdictFor = (
  value: number,
  band: readonly [number, number],
): FitStatus => {
  const [low, high] = band;
  if (value >= low && value <= high) return "pass";

  const width = high - low;
  const tolerance =
    width > 0
      ? width * DRIFT_MULTIPLE
      : Math.abs(high) * ZERO_WIDTH_TOLERANCE || DRIFT_MULTIPLE;

  const distance = value < low ? low - value : value - high;
  return distance <= tolerance ? "drift" : "fail";
};
