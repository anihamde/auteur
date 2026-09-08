import { z } from "zod";

export const FIT_STATUSES = [
  "pass",
  "drift",
  "fail",
  "insufficient-length",
] as const;
export const fitStatusSchema = z.enum(FIT_STATUSES);
export type FitStatus = z.infer<typeof fitStatusSchema>;

export const ORIGINS = ["measured", "derived", "edited"] as const;
export const originSchema = z.enum(ORIGINS);
export type Origin = z.infer<typeof originSchema>;

/**
 * How a measure's band was derived.
 *
 * A card built from fewer than four works has too few points for a quartile, so
 * it records `range` and the report says the band is a range rather than an
 * interquartile band. Silently calling a two-point spread an IQR would be a
 * claim the data cannot support.
 */
export const bandBasisSchema = z.enum(["iqr", "range"]);
export type BandBasis = z.infer<typeof bandBasisSchema>;

/**
 * The provenance of a measure that is a **proxy rather than a count**.
 *
 * Carried by `latinateRatio` and by nothing else (§4.3). Every other scored
 * measure is a count of things in the text; the latinate ratio is a suffix
 * classifier's guess, and a reader is never shown its verdict without being
 * told so. `validated` flips and `precision` is filled in once the hand-labelled
 * validation set has measured it; below 0.85 the measure is demoted out of the
 * report entirely.
 */
export const classifierSchema = z.object({
  kind: z.literal("suffix-proxy"),
  precision: z.number().min(0).max(1).optional(),
  validated: z.boolean(),
});
export type Classifier = z.infer<typeof classifierSchema>;

export const fitMeasureSchema = z.object({
  band: z.tuple([z.number(), z.number()]),
  bandBasis: bandBasisSchema,
  classifier: classifierSchema.optional(),
  corpusValue: z.number(),
  label: z.string().min(1),
  path: z.string().min(1),
  status: fitStatusSchema,
  targetOrigin: originSchema,
  targetValue: z.number(),
  value: z.number(),
});
export type FitMeasure = z.infer<typeof fitMeasureSchema>;

/**
 * A `critique` finding.
 *
 * `text` must contain a digit. The product's claim is that numbers carry the
 * argument, and a finding reading "the voice feels slightly off" is the exact
 * failure mode this whole design exists to avoid — so the engine drops one
 * without a number rather than rendering it (§9.2).
 */
export const findingSchema = z.object({
  path: z.string().min(1),
  remedy: z.string().min(1).optional(),
  status: z.enum(["pass", "drift", "fail"]),
  text: z.string().regex(/\d/, "a finding must state a number"),
});
export type Finding = z.infer<typeof findingSchema>;

export const styleFitReportSchema = z.object({
  findings: z.array(findingSchema),
  measures: z.array(fitMeasureSchema),
  summary: z.string().min(1),
});
export type StyleFitReport = z.infer<typeof styleFitReportSchema>;
