import { z } from "zod";
import { fitMeasureSchema, styleFitReportSchema } from "./fit.ts";
import { roleSchema, tierSchema, usageSchema } from "./pipeline.ts";
import {
  decisionEntrySchema,
  outlineSchema,
  questionSchema,
  stepSchema,
} from "./session.ts";
import { styleCardSchema } from "./style-card.ts";

/**
 * The closed event vocabulary, and the order is part of the contract.
 *
 * Every stage emits events; `streams: false` means a start and an end and no
 * deltas. So the web app has no branch for "stages that show progress" — the
 * vocabulary is total, which is the whole reason it is closed
 * (`docs/ARCHITECTURE.md` §6.8).
 *
 * `stage_detail` carries the lines the design's `Thinking` rows render, and
 * they are produced by the **server**. That is what makes them honest: "12
 * works sampled across 1935 to 1975" is a fact the stage returned, not a
 * sentence the UI assembled from a spinner.
 */
export const sessionEventSchema = z.discriminatedUnion("type", [
  z.object({
    modelId: z.string().optional(),
    role: roleSchema,
    stageId: z.string(),
    tier: tierSchema.optional(),
    type: z.literal("stage_start"),
  }),
  z.object({
    line: z.string().min(1),
    stageId: z.string(),
    type: z.literal("stage_detail"),
  }),
  z.object({
    stageId: z.string(),
    text: z.string(),
    type: z.literal("stage_delta"),
  }),
  z.object({
    costMicros: z.number().int().nonnegative().optional(),
    elapsedMs: z.number().nonnegative(),
    stageId: z.string(),
    type: z.literal("stage_end"),
    usage: usageSchema.optional(),
  }),
  z.object({
    code: z.string(),
    message: z.string(),
    stageId: z.string(),
    type: z.literal("stage_error"),
  }),
  z.object({ card: styleCardSchema, type: z.literal("card") }),
  z.object({
    done: z.boolean(),
    questions: z.array(questionSchema),
    round: z.number().int().min(1).max(3),
    type: z.literal("questions"),
  }),
  z.object({ outline: outlineSchema, type: z.literal("outline") }),
  z.object({
    measures: z.array(fitMeasureSchema),
    type: z.literal("drift"),
  }),
  z.object({ report: styleFitReportSchema, type: z.literal("report") }),
  z.object({ entry: decisionEntrySchema, type: z.literal("decision") }),
  z.object({ step: stepSchema, type: z.literal("step") }),
  z.object({
    reason: z.enum(["complete", "cancelled", "error"]),
    type: z.literal("session_end"),
  }),
]);
export type SessionEvent = z.infer<typeof sessionEventSchema>;
export type SessionEventType = SessionEvent["type"];

/** An event as it is stored and replayed: the payload plus its cursor. */
export const storedEventSchema = z.object({
  createdAt: z.date(),
  event: sessionEventSchema,
  /** Gap-free per session, from 1. §7.3. */
  seq: z.number().int().min(1),
  sessionId: z.uuid(),
});
export type StoredEvent = z.infer<typeof storedEventSchema>;
