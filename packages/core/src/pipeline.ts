import { z } from "zod";

export const TIERS = ["cheap", "balanced", "strong"] as const;
export const tierSchema = z.enum(TIERS);
export type Tier = z.infer<typeof tierSchema>;

/**
 * What a stage is for.
 *
 * `revise` and `critique` are gone with the stages that held them: the reader's
 * note is what a revision now is, and the critique it replaced was a model
 * judging prose the reader was about to judge themselves. A role no stage
 * carries is a role a pipeline file could still name, which is a stage the
 * dispatcher has no branch for.
 */
export const ROLES = [
  "research",
  "fetch",
  "measure",
  "question",
  "outline",
  "draft",
] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const DRAFT_STRATEGIES = ["single-call", "sequential-scene"] as const;
export const draftStrategySchema = z.enum(DRAFT_STRATEGIES);
export type DraftStrategy = z.infer<typeof draftStrategySchema>;

/**
 * A pipeline stage.
 *
 * `tier` is optional and that is the point: `docs/ARCHITECTURE.md` §6.1 makes
 * `prosody-compute`, `work-fetch` and `style-fit` stages with no model, which
 * is what gives them a `Thinking` row with a null tier badge and stops tier
 * resolution needing a "some stages have no model" special case.
 *
 * `reads` is what §7.5's staleness is derived from, rather than seven `if`
 * statements — the difference between a rule and a pile of cases.
 */
export const stageSchema = z.object({
  id: z.string().min(1),
  /** Absent iff `tier` is absent. */
  promptId: z.string().min(1).optional(),
  /** Stages whose artifacts this one consumes. */
  reads: z.array(z.string().min(1)),
  role: roleSchema,
  streams: z.boolean(),
  /** `undefined` for a deterministic stage: no model, no cost, no tier badge. */
  tier: tierSchema.optional(),
  /** True when the stage's output is parsed against a schema. */
  typed: z.boolean(),
});
export type Stage = z.infer<typeof stageSchema>;

export const pipelineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  stages: z.array(stageSchema).min(1),
});
export type Pipeline = z.infer<typeof pipelineSchema>;

export const usageSchema = z.object({
  cachedInputTokens: z.number().int().nonnegative(),
  /** Excludes `cachedInputTokens`. Folding them in over-reports cost. §10.2. */
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
export type Usage = z.infer<typeof usageSchema>;

export const STAGE_RUN_STATUSES = [
  "running",
  "ok",
  "error",
  "cancelled",
] as const;
export const stageRunStatusSchema = z.enum(STAGE_RUN_STATUSES);
export type StageRunStatus = z.infer<typeof stageRunStatusSchema>;
