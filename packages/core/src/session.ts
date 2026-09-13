import { z } from "zod";

/** The seven wizard steps, in order. `docs/ARCHITECTURE.md` §3.2. */
export const STEPS = [
  "idea",
  "author",
  "research",
  "clarify",
  "outline",
  "draft",
  "result",
] as const;
export const stepSchema = z.enum(STEPS);
export type Step = z.infer<typeof stepSchema>;

export const LENGTH_PRESETS = ["flash", "short", "long", "novelette"] as const;
export const lengthPresetSchema = z.enum(LENGTH_PRESETS);
export type LengthPreset = z.infer<typeof lengthPresetSchema>;

/**
 * Word targets per preset. The draft strategy follows from these and from the
 * model's real `maxOutputTokens` (§6.6), never from the preset alone.
 */
export const WORD_TARGET: Readonly<Record<LengthPreset, number>> = {
  flash: 1000,
  long: 12_000,
  novelette: 20_000,
  short: 4000,
};

/**
 * Timestamps are **coerced**, not required to be `Date`.
 *
 * The same schema parses a row from `pg` — where these are real `Date`s — and a
 * JSON body off the wire, where they are ISO strings. `z.coerce.date()` accepts
 * both, which is what lets one schema be the boundary parser on both sides
 * rather than two that have to agree.
 */
export const sessionSchema = z.object({
  authorId: z.string().nullable(),
  cardId: z.uuid().nullable(),
  constraints: z.string().nullable(),
  createdAt: z.coerce.date(),
  id: z.uuid(),
  /** Verbatim. Nothing rewrites this before it reaches the pipeline. */
  idea: z.string().min(1),
  lengthPreset: lengthPresetSchema,
  step: stepSchema,
  updatedAt: z.coerce.date(),
});
export type Session = z.infer<typeof sessionSchema>;

export const ANSWER_STATES = [
  "open",
  "answered",
  "skipped",
  "invalidated",
] as const;
export const answerStateSchema = z.enum(ANSWER_STATES);
export type AnswerState = z.infer<typeof answerStateSchema>;

/**
 * A clarifying question.
 *
 * `decision` and `whyAsked` are required non-empty strings with real minimum
 * lengths, and that is the whole mechanism behind `PRD.md` §6's rule that a
 * question which cannot state its purpose is not asked. As a prompt
 * instruction it is a suggestion; here it is a **parse failure**, so such a
 * question never reaches the UI (§6.5).
 */
export const questionSchema = z.object({
  answer: z.string().nullable(),
  answerState: answerStateSchema,
  decision: z.string().min(8),
  dependsOn: z.array(z.uuid()),
  id: z.uuid(),
  ordinal: z.number().int().nonnegative(),
  round: z.number().int().min(1).max(3),
  sessionId: z.uuid(),
  suggestions: z.array(z.string().min(1)).min(2).max(4),
  text: z.string().min(1),
  whyAsked: z.string().min(16),
});
export type Question = z.infer<typeof questionSchema>;

/**
 * A decisions-log row.
 *
 * The three origins are the design's, and the interesting one is the third:
 * a decision no question was ever asked about. That is what makes the log
 * honest rather than a list of things the user already knows they answered.
 */
export const DECISION_ORIGINS = [
  "you answered",
  "model chose — question skipped",
  "model chose — not asked",
] as const;
export const decisionOriginSchema = z.enum(DECISION_ORIGINS);
export type DecisionOrigin = z.infer<typeof decisionOriginSchema>;

export const decisionEntrySchema = z.object({
  decision: z.string().min(1),
  origin: decisionOriginSchema,
  reason: z.string().min(1),
});
export type DecisionEntry = z.infer<typeof decisionEntrySchema>;

/**
 * The stages a reader may write a note about.
 *
 * Not every stage: a note is about something the reader has read, and the
 * research stages produce a card rather than a document. Narrow so that a
 * typo in a request body is a 400 rather than a note filed against a stage id
 * that will never look for one.
 */
export const REVISABLE_STAGES = ["outline", "draft"] as const;
export const revisableStageSchema = z.enum(REVISABLE_STAGES);
export type RevisableStage = z.infer<typeof revisableStageSchema>;

/**
 * A note the reader wrote about a stage's output.
 *
 * Free text, and deliberately: `PRD.md` §6 has the model ask closed questions
 * because a closed question is answerable before the thing exists. A note is
 * about the thing that exists, and nothing anticipated it — so there is no
 * schema for what it may say, and the whole of its structure is which stage it
 * is about and when it was written.
 *
 * Notes accumulate and are never edited. "Shorter in the middle", then "and
 * give the ending more room", is two notes rather than a replacement, and the
 * stage reads them in order.
 */
export const NOTE_LONGEST = 2000;
export const revisionNoteSchema = z.object({
  createdAt: z.coerce.date(),
  id: z.uuid(),
  note: z.string().trim().min(1).max(NOTE_LONGEST),
  sessionId: z.uuid(),
  stageId: revisableStageSchema,
});
export type RevisionNote = z.infer<typeof revisionNoteSchema>;

/** The four artifact kinds `artifacts.kind` admits. */
export const ARTIFACT_KINDS = [
  "outline",
  "draft",
  "report",
  "decisions",
] as const;
export const artifactKindSchema = z.enum(ARTIFACT_KINDS);
export type ArtifactKind = z.infer<typeof artifactKindSchema>;

/**
 * The `draft` artifact's body, and the story the session view returns.
 *
 * One schema for both, because they are the same value read twice — and a
 * response shape written separately from the artifact it is read out of is two
 * descriptions of one thing that agree until they do not.
 *
 * `title` is nullable rather than optional: a draft produced before the outline
 * named the story has no title, and that is a fact worth carrying rather than a
 * field to omit.
 */
export const storySchema = z.object({
  markdown: z.string(),
  title: z.string().nullable(),
  wordCount: z.number().int().nonnegative(),
});
export type Story = z.infer<typeof storySchema>;

export const outlineSchema = z.object({
  beats: z
    .array(
      z.object({ index: z.number().int().min(1), text: z.string().min(1) }),
    )
    .min(1),
  title: z.string().min(1),
});
export type Outline = z.infer<typeof outlineSchema>;
