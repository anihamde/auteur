import { outlineSchema, storySchema, WORD_TARGET } from "@auteur/core/session";
import type { Exemplar, StyleCard } from "@auteur/core/style-card";
import { findPassages } from "@auteur/corpus-store/passages";
import { AuteurError } from "@auteur/errors/auteur-error";
import {
  type ProsodyUnit,
  prosodyValue,
} from "@auteur/formatting/prosody-value";
import { newId } from "@auteur/ids/new-id";
import { applyBudget, clarifyResultSchema } from "@auteur/pipeline/clarify";
import { clarify as clarifyPrompt } from "@auteur/prompt/clarify";
import { outline as outlinePrompt } from "@auteur/prompt/outline";
import {
  type Exemplar as StoryExemplar,
  story as storyPrompt,
} from "@auteur/prompt/story";
import { findArtifact, putArtifact } from "@auteur/session-store/artifacts";
import {
  answerSetFor,
  listQuestions,
  putQuestionRound,
} from "@auteur/session-store/questions";
import { listRevisionNotes } from "@auteur/session-store/revision-notes";
import { targetBands } from "@auteur/style-fit/measures";
import { countWords } from "@auteur/text/tokenize";
import { z } from "zod";
import { callModel, type StageContext } from "./context.ts";

/**
 * The three stages that produce prose: clarify, outline, story.
 *
 * Each is the same shape — read what the session has, build one prompt, call
 * one model, parse, write — and the shape is the point. A stage that departed
 * from it would be a stage whose failure mode nobody else's tests describe.
 *
 * There were five. `critique` read the draft against the card and `revise`
 * applied what it found: two calls of the strongest tier spent on a judgement
 * the reader was about to make and could state in a sentence. A note from the
 * reader is what replaced them, and `story` is the stage that reads it.
 */

/**
 * A card, summarised for a prompt.
 *
 * The whole card is too long to put in every prompt and the interesting part is
 * the same each time: what the measurement says the prose does. Rendered here
 * rather than in each prompt module so all five see the same summary and a card
 * field added later reaches every stage at once.
 */
export const summariseCard = (card: StyleCard): string =>
  [
    `voice: ${String(card.voice.pov.value)}, ${String(card.voice.tense.value)}, ${String(card.voice.narratorDistance.value)}`,
    `diction: ${String(card.diction.register.value)}; concreteness ${String(card.diction.concreteness.value)}`,
    `rhythm: ${String(card.rhythm.repetitionHabits.value)}`,
    `structure: ${String(card.structure.sceneVsSummary.value)}`,
    `dialogue: ${String(card.dialogue.tagConventions.value)}`,
    `sentence length: mean ${card.prosody.sentenceLength.mean.toString()}`,
  ].join("\n");

/**
 * The unit a measure is rendered in, derived from its path.
 *
 * The same derivation the export uses, and for the same reason: the unit is a
 * property of what is measured, not of a particular reading, so it is not a
 * field a stage could get wrong.
 */
const unitFor = (path: string): ProsodyUnit => {
  if (path.includes("punctuation")) return "per1k";
  if (path.endsWith("Ratio") || path.endsWith("mattr")) return "ratio";
  return "words";
};

/**
 * Exemplars carrying the passage each one points at.
 *
 * The card stores an exemplar as a `passageId` and what it demonstrates — the
 * passage itself lives in `passages`, where it is shared with every other card
 * that cites it. The drafting stage was building its prompt straight from the
 * card and passing `text: ""`, so the "Passages from the author's own work,
 * verbatim" section was fifteen headings over nothing: the one place in the
 * pipeline where the author's actual prose reaches the model had none of it.
 *
 * An exemplar whose passage is gone — or stored empty — is dropped rather than
 * rendered blank. A heading with no body is not weaker evidence, it is a claim
 * with none, and it is the state this function exists to make impossible.
 */
export const attachPassageText = (
  exemplars: readonly Exemplar[],
  passages: readonly { readonly id: string; readonly text: string }[],
): StoryExemplar[] => {
  const byId = new Map(passages.map((passage) => [passage.id, passage.text]));
  return exemplars.flatMap((exemplar) => {
    const text = byId.get(exemplar.passageId);
    return text === undefined || text.length === 0
      ? []
      : [
          {
            demonstrates: exemplar.demonstrates,
            text,
            workTitle: exemplar.workTitle,
          },
        ];
  });
};

/**
 * The measured targets, as the draft is asked to aim at them.
 *
 * The same bands `style-fit` will score the draft against, rendered in the same
 * units the report renders them in. `runDraft` was passing the card summary
 * here — the prompt's "Measured targets" section repeated its "style card"
 * section word for word, and the numbers never arrived.
 */
export const renderTargets = (card: StyleCard): string =>
  targetBands(card)
    .map((target) => {
      const unit = unitFor(target.path);
      return `- ${target.label}: ${prosodyValue(target.corpusValue, unit)} (corpus range ${prosodyValue(target.band[0], unit)}–${prosodyValue(target.band[1], unit)})`;
    })
    .join("\n");

const priorAnswers = async (context: StageContext) => {
  const [answered, questions] = await Promise.all([
    answerSetFor(context.db, context.sessionId),
    listQuestions(context.db, context.sessionId),
  ]);
  const byId = new Map(questions.map((question) => [question.id, question]));
  return answered.map((entry) => ({
    answer: entry.answer,
    decision: byId.get(entry.id)?.decision ?? "",
    question: byId.get(entry.id)?.text ?? "",
  }));
};

export const CLARIFY_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    done: { type: "boolean" },
    questions: {
      items: {
        additionalProperties: false,
        properties: {
          decision: { type: "string" },
          dependsOn: { items: { type: "string" }, type: "array" },
          suggestions: { items: { type: "string" }, type: "array" },
          text: { type: "string" },
          whyNotSettled: { type: "string" },
        },
        required: [
          "decision",
          "dependsOn",
          "suggestions",
          "text",
          "whyNotSettled",
        ],
        type: "object",
      },
      type: "array",
    },
  },
  required: ["done", "questions"],
  type: "object",
} as const;

/**
 * `clarify` — one round of questions.
 *
 * The budget is applied by `@auteur/pipeline` and not here: three rounds and
 * eight questions are the pipeline's constants, and a stage body that trimmed
 * the list itself would be a second place the budget lives.
 */
export const runClarify = async (
  context: StageContext,
  card: StyleCard,
): Promise<{ readonly asked: number; readonly done: boolean }> => {
  const existing = await listQuestions(context.db, context.sessionId);
  const round = Math.max(0, ...existing.map((question) => question.round)) + 1;

  const result = await callModel(context, {
    jsonSchema: CLARIFY_JSON_SCHEMA,
    prompt: clarifyPrompt.build({
      answers: await priorAnswers(context),
      authorName: card.author.displayName,
      cardSummary: summariseCard(card),
      constraints: context.session.constraints,
      idea: context.session.idea,
      lengthPreset: context.session.lengthPreset,
      round,
    }),
    schema: clarifyResultSchema,
    system: "Return only JSON matching the declared schema.",
  });

  const budgeted = applyBudget({
    answered: existing.map((question) => ({
      answer: question.answer,
      answerState: question.answerState,
      id: question.id,
    })),
    askedSoFar: existing.length,
    result,
    round,
  });

  await putQuestionRound(
    context.db,
    budgeted.questions.map((question, ordinal) => ({
      answer: null,
      answerState: "open" as const,
      decision: question.decision,
      dependsOn: [],
      id: newId(),
      ordinal,
      round,
      sessionId: context.sessionId,
      suggestions: question.suggestions,
      text: question.text,
      whyAsked: question.whyNotSettled,
    })),
  );

  return { asked: budgeted.questions.length, done: budgeted.done };
};

export const OUTLINE_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    beats: {
      items: {
        additionalProperties: false,
        properties: {
          index: { type: "integer" },
          text: { type: "string" },
        },
        required: ["index", "text"],
        type: "object",
      },
      type: "array",
    },
    title: { type: "string" },
  },
  required: ["beats", "title"],
  type: "object",
} as const;

/** `outline` — the beat sheet. Stored as the `outline` artifact. */
export const runOutline = async (
  context: StageContext,
  card: StyleCard,
  inputKey: string,
) => {
  const outline = await callModel(context, {
    jsonSchema: OUTLINE_JSON_SCHEMA,
    prompt: outlinePrompt.build({
      answers: await priorAnswers(context),
      authorName: card.author.displayName,
      cardSummary: summariseCard(card),
      constraints: context.session.constraints,
      idea: context.session.idea,
      lengthPreset: context.session.lengthPreset,
      wordTarget: WORD_TARGET[context.session.lengthPreset],
    }),
    schema: outlineSchema,
    system: "Return only JSON matching the declared schema.",
  });

  await putArtifact(context.db, {
    body: outline,
    inputKey,
    kind: "outline",
    sessionId: context.sessionId,
  });
  return outline;
};

/**
 * The story as it is stored, with the bookkeeping the stage needs and the
 * response does not.
 *
 * `storySchema` strips what it does not name, so these two fields live in the
 * artifact and never reach `GET /api/sessions/:id`. They are facts about how
 * this row was produced rather than about the story, and a screen that could
 * read them is a screen that could come to depend on them.
 */
export const storedStorySchema = storySchema.extend({
  /** The notes already applied. Anything else is what this run is for. */
  noteIds: z.array(z.uuid()).default([]),
  /** The `outline` artifact's key when this was written. See `runStory`. */
  outlineKey: z.string().default(""),
});

/**
 * What this run of `story` is revising, if anything.
 *
 * Three cases, and the middle one is the one that is easy to get wrong.
 *
 * - **The beat sheet moved.** `outlineKey` differs, so the stored prose was
 *   written from a beat sheet that has been replaced — a regenerated outline, a
 *   changed answer, a different card. Revising it would produce a careful
 *   edit of a story nobody is going to read. Write it again, and carry the
 *   reader's notes into the writing rather than dropping them.
 * - **New notes on the same beat sheet.** Revise, and send **only** the notes
 *   the stored prose was not written from. Sending all of them re-applies the
 *   earlier ones to a story that already has them, and "cut the second scene to
 *   half" applied twice is a scene at a quarter.
 * - **Nothing new.** Some other input changed — the preset, the card — so there
 *   is nothing to revise and the story is written again.
 */
export const revisionFor = (input: {
  readonly stored: z.infer<typeof storedStorySchema> | undefined;
  readonly notes: readonly { readonly id: string; readonly note: string }[];
  readonly outlineKey: string;
}): { readonly notes?: string[]; readonly previousStory?: string } => {
  const sameOutline =
    input.stored !== undefined && input.stored.outlineKey === input.outlineKey;
  const applied = new Set(sameOutline ? (input.stored?.noteIds ?? []) : []);
  const pending = input.notes
    .filter((note) => !applied.has(note.id))
    .map((note) => note.note);

  if (pending.length === 0) return {};
  return {
    notes: pending,
    ...(sameOutline &&
      input.stored !== undefined && { previousStory: input.stored.markdown }),
  };
};

/**
 * `story` — the prose, written or written again.
 *
 * One stage for both, because a rewrite differs from a first attempt in exactly
 * one way: there is a story already and there is something the reader said
 * about it. Both are read here and handed to the same prompt.
 *
 * The word count goes out as a detail line. A story that came back at a fifth
 * of the length is not an error, but it is a fact the report will be scoring
 * against and the reader should see it before then.
 */
export const runStory = async (
  context: StageContext,
  card: StyleCard,
  outline: z.infer<typeof outlineSchema>,
  outlineKey: string,
  inputKey: string,
) => {
  const target = WORD_TARGET[context.session.lengthPreset];
  const [passages, notes, existing] = await Promise.all([
    findPassages(
      context.db,
      card.exemplars.map((exemplar) => exemplar.passageId),
    ),
    listRevisionNotes(context.db, context.sessionId, "story"),
    findArtifact(context.db, context.sessionId, "draft"),
  ]);

  const stored =
    existing === undefined ? undefined : storedStorySchema.parse(existing.body);
  const revision = revisionFor({ notes, outlineKey, stored });

  const text = await callModel(context, {
    prompt: storyPrompt.build({
      antiPatterns: card.antiPatterns.value,
      authorName: card.author.displayName,
      beats: outline.beats,
      cardSummary: summariseCard(card),
      exemplars: attachPassageText(card.exemplars, passages),
      lengthPreset: context.session.lengthPreset,
      ...revision,
      targets: renderTargets(card),
      title: outline.title,
      wordTarget: target,
    }),
    // Prose, not JSON. No `jsonSchema`, which is what tells `callModel` to
    // apply this schema to the text rather than to `JSON.parse` of it — the
    // distinction that had every draft thrown away as "did not return JSON".
    schema: z.string().min(1),
    system:
      revision.previousStory === undefined
        ? "Write the story itself. Return prose only — no preamble, no headings that the beat sheet did not ask for, no commentary."
        : "Return the revised story whole. Change what the reader asked for and leave the rest as it stands. Prose only — no preamble, no commentary.",
  });

  const wordCount = countWords(text);
  await context.emit({
    line: `${wordCount.toLocaleString("en-US")} words against a target of ${target.toLocaleString("en-US")}`,
    stageId: context.stage.id,
    type: "stage_detail",
  });

  const written = {
    markdown: text,
    // Every note the reader has filed is applied now, whether it was revised
    // into an existing story or written into a new one. A note left unapplied
    // here is a note whose key is already recorded, so nothing would ever run
    // to apply it — the state that made a note filed before the first story
    // vanish.
    noteIds: notes.map((note) => note.id),
    outlineKey,
    title: outline.title,
    wordCount,
  };
  await putArtifact(context.db, {
    body: written,
    inputKey,
    kind: "draft",
    sessionId: context.sessionId,
  });
  return written;
};

/** Raised when a stage that needs the card is reached without one. */
export const requireCard = (card: StyleCard | undefined): StyleCard => {
  if (card === undefined) {
    throw new AuteurError(
      "invalid_input",
      "This stage needs a style card and the session has none.",
    );
  }
  return card;
};
