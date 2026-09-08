/**
 * Whether `latinateRatio` is a scored measure or a drafting hint.
 *
 * `docs/ARCHITECTURE.md` §4.3 gates the measure on precision against a
 * hand-labelled validation set: at or above 0.85 it stays scored; below, it is
 * demoted out of the report entirely and goes into the draft prompt as a
 * register hint.
 *
 * **The gate result is read, never hardcoded.** `@auteur/style-fit`'s scored set
 * asks this function rather than counting to five, so promotion or demotion is
 * a change here and nowhere else — and the two can never disagree about how
 * many measures the report scores.
 */
export const PRECISION_THRESHOLD = 0.85;

export type LatinateGate =
  | {
      readonly scored: true;
      readonly validated: boolean;
      readonly precision?: number;
    }
  | {
      readonly scored: false;
      readonly validated: true;
      readonly precision: number;
    };

/**
 * The validation set does not exist yet: the build session cannot reach a
 * corpus to draw one from (`docs/IMPLEMENTATION-PLAN.md` §4/S3), and a set
 * assembled from memory and then scored against a classifier tuned to match it
 * is the exact failure the gate was built to prevent.
 *
 * So the measure ships **scored and unvalidated**, and every `FitMeasure` it
 * produces carries `classifier: { kind: "suffix-proxy", validated: false }` —
 * the UI reads `latinate ratio (suffix proxy, unvalidated)`. A reader is never
 * shown its verdict without being told what produced it, which is what makes
 * scoring an admitted proxy honest rather than a claim the product cannot
 * support.
 *
 * WP-X0 replaces this with a measured result.
 */
export const latinateGate = (): LatinateGate => ({
  scored: true,
  validated: false,
});
