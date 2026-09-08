import { z } from "zod";

/**
 * How a text marks speech.
 *
 * Without this, dialogue ratio silently reports **zero** for any text that
 * marks speech with an em dash — which includes several of the translations
 * this corpus is made of (`docs/ARCHITECTURE.md` §4.2). A zero that looks like
 * a measurement is worse than no measurement, so the convention is detected,
 * recorded, and measured against.
 */
export const DIALOGUE_MARKERS = [
  "double",
  "single",
  "guillemet",
  "em-dash",
  "none",
  "mixed",
] as const;
export const dialogueMarkerSchema = z.enum(DIALOGUE_MARKERS);
export type DialogueMarker = z.infer<typeof dialogueMarkerSchema>;

const distributionSchema = z.object({
  mean: z.number().nonnegative(),
  median: z.number().nonnegative(),
  p10: z.number().nonnegative(),
  p90: z.number().nonnegative(),
  stdev: z.number().nonnegative(),
});

export const punctuationRatesSchema = z.object({
  colon: z.number().nonnegative(),
  ellipsis: z.number().nonnegative(),
  emDash: z.number().nonnegative(),
  exclamation: z.number().nonnegative(),
  question: z.number().nonnegative(),
  semicolon: z.number().nonnegative(),
});
export type PunctuationRates = z.infer<typeof punctuationRatesSchema>;

export const workProsodySchema = z.object({
  dialogueRatio: z.number().min(0).max(1),
  latinateRatio: z.number().min(0).max(1),
  mattr: z.number().min(0).max(1),
  paragraphLength: z.object({
    mean: z.number().nonnegative(),
    median: z.number().nonnegative(),
  }),
  punctuation: punctuationRatesSchema,
  sentenceLength: distributionSchema,
  words: z.number().int().nonnegative(),
});
export type WorkProsody = z.infer<typeof workProsodySchema>;

/**
 * The measured block. Invariant 1: computed from full text with no model
 * anywhere in the path, and nothing overwrites it.
 *
 * Deliberately **not** wrapped in `Claim`. A `Claim<number>` whose `origin`
 * could be anything but `measured` is a type that permits invariant 1 to be
 * broken; making the measured block a plain object means no code path can even
 * express the mistake. What a draft aims at is `ProsodyTarget`, a different
 * field.
 */
export const prosodyBlockSchema = workProsodySchema.extend({
  commonBigrams: z.array(z.string()),
  dialogueMarker: dialogueMarkerSchema,
  /** The same measures per work, so the card can show the spread. §4.3. */
  perWork: z.record(z.string(), workProsodySchema),
});
export type ProsodyBlock = z.infer<typeof prosodyBlockSchema>;

/**
 * What the draft aims at. Defaults, field for field, to `prosody`.
 *
 * In v1 it always equals the measurement (§4.6): nothing writes an overlay, and
 * the tension the design's mockup points at — a corpus mean that flash length
 * cannot carry — is handled by a precedence clause in the draft prompt rather
 * than by moving the target.
 */
export const prosodyTargetSchema = z.object({
  dialogueRatio: z.number().min(0).max(1),
  latinateRatio: z.number().min(0).max(1),
  mattr: z.number().min(0).max(1),
  punctuation: punctuationRatesSchema,
  sentenceLength: distributionSchema,
});
export type ProsodyTarget = z.infer<typeof prosodyTargetSchema>;
