import type { Finding } from "@auteur/core/fit";
import { outlineSchema, WORD_TARGET } from "@auteur/core/session";
import type { StyleCard } from "@auteur/core/style-card";
import { AuteurError } from "@auteur/errors/auteur-error";
import {
  type ProsodyUnit,
  prosodyValue,
} from "@auteur/formatting/prosody-value";
import { newId } from "@auteur/ids/new-id";
import { applyBudget, clarifyResultSchema } from "@auteur/pipeline/clarify";
import { clarify as clarifyPrompt } from "@auteur/prompt/clarify";
import { critique as critiquePrompt } from "@auteur/prompt/critique";
import { draft as draftPrompt } from "@auteur/prompt/draft";
import { outline as outlinePrompt } from "@auteur/prompt/outline";
import { revise as revisePrompt } from "@auteur/prompt/revise";
import { measureWork } from "@auteur/prosody/prosody";
import { putArtifact } from "@auteur/session-store/artifacts";
import {
  answerSetFor,
  listQuestions,
  putQuestionRound,
} from "@auteur/session-store/questions";
import { triageFindings } from "@auteur/style-fit/findings";
import { measuresFor } from "@auteur/style-fit/measures";
import { detectDialogueMarker } from "@auteur/text/dialogue-marker";
import { countWords } from "@auteur/text/tokenize";
import { z } from "zod";
import { callModel, type StageContext } from "./context.ts";

/**
 * The five stages that produce prose: clarify, outline, draft, critique,
 * revise.
 *
 * Each is the same shape — read what the session has, build one prompt, call
 * one model, parse, write — and the shape is the point. A stage that departed
 * from it would be a stage whose failure mode nobody else's tests describe.
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
 * `draft` — the story.
 *
 * The only stage whose output is prose rather than JSON, so it is the only one
 * that does not go through `callModel`'s parse. What it does instead is check
 * the word count against the target and say so in a detail line: a draft that
 * came back at a fifth of the length is not an error, but it is a fact the
 * report will be scoring against and the reader should see it before then.
 */
export const runDraft = async (
  context: StageContext,
  card: StyleCard,
  outline: z.infer<typeof outlineSchema>,
  inputKey: string,
) => {
  const target = WORD_TARGET[context.session.lengthPreset];
  const text = await callModel(context, {
    prompt: draftPrompt.build({
      antiPatterns: card.antiPatterns.value,
      authorName: card.author.displayName,
      beats: outline.beats,
      cardSummary: summariseCard(card),
      exemplars: card.exemplars.map((exemplar) => ({
        demonstrates: exemplar.demonstrates,
        text: "",
        workTitle: exemplar.workTitle,
      })),
      lengthPreset: context.session.lengthPreset,
      targets: summariseCard(card),
      title: outline.title,
      wordTarget: target,
    }),
    // Prose, not JSON. No `jsonSchema`, which is what tells `callModel` to
    // apply this schema to the text rather than to `JSON.parse` of it — the
    // distinction that had every draft thrown away as "did not return JSON".
    schema: z.string().min(1),
    system:
      "Write the story itself. Return prose only — no preamble, no headings that the beat sheet did not ask for, no commentary.",
  });

  const wordCount = countWords(text);
  await context.emit({
    line: `${wordCount.toLocaleString("en-US")} words against a target of ${target.toLocaleString("en-US")}`,
    stageId: context.stage.id,
    type: "stage_detail",
  });

  const story = { markdown: text, title: outline.title, wordCount };
  await putArtifact(context.db, {
    body: story,
    inputKey,
    kind: "draft",
    sessionId: context.sessionId,
  });
  return story;
};

export const FINDINGS_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    findings: {
      items: {
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          quote: { type: "string" },
          remedy: { type: "string" },
          what: { type: "string" },
        },
        required: ["path", "quote", "remedy", "what"],
        type: "object",
      },
      type: "array",
    },
  },
  required: ["findings"],
  type: "object",
} as const;

/**
 * `critique` — read the draft against the card.
 *
 * Its findings are **triaged** before anything is kept: a finding that cites a
 * card path the card does not have, or a measure nothing measured, is dropped.
 * §9 says a critique may only fault the draft against something that was
 * actually measured, and that is enforced here rather than asked for in the
 * prompt — a prompt asks, and a filter decides.
 */
export const runCritique = async (
  context: StageContext,
  card: StyleCard,
  story: { readonly markdown: string },
) => {
  // The marker convention is detected from the draft rather than assumed:
  // §6.7's dialogue ratio is meaningless against the wrong one, and the same
  // detector runs over the corpus.
  const draftProsody = measureWork(
    story.markdown,
    detectDialogueMarker(story.markdown),
  );
  const measures = measuresFor({ card, draft: draftProsody });

  const raw = await callModel(context, {
    jsonSchema: FINDINGS_JSON_SCHEMA,
    prompt: critiquePrompt.build({
      authorName: card.author.displayName,
      cardSummary: summariseCard(card),
      draft: story.markdown,
      measures: measures.map((measure) => ({
        path: measure.path,
        status: measure.status,
        target: `${prosodyValue(measure.band[0], unitFor(measure.path))}–${prosodyValue(measure.band[1], unitFor(measure.path))}`,
        value: prosodyValue(measure.value, unitFor(measure.path)),
      })),
    }),
    schema: z.object({ findings: z.array(z.unknown()) }),
    system: "Return only JSON matching the declared schema.",
  });

  const triage = triageFindings(raw.findings, card, measures);
  for (const dropped of triage.dropped) {
    await context.emit({
      line: `dropped a finding: ${dropped.why}`,
      stageId: context.stage.id,
      type: "stage_detail",
    });
  }
  return { findings: triage.kept, measures };
};

/** `revise` — apply the findings, or replace one span. */
export const runRevise = async (
  context: StageContext,
  card: StyleCard,
  story: { readonly markdown: string; readonly title: string | null },
  findings: readonly Finding[],
  inputKey: string,
) => {
  const text = await callModel(context, {
    prompt: revisePrompt.build({
      authorName: card.author.displayName,
      cardSummary: summariseCard(card),
      draft: story.markdown,
      // A finding with no remedy still travels: naming the drift without
      // prescribing a fix is a legitimate finding, and dropping it here would
      // silently narrow what the revision is told about.
      remedies: findings.map((finding) => ({
        finding: finding.text,
        path: finding.path,
        remedy: finding.remedy ?? "",
      })),
    }),
    schema: z.string().min(1),
    system:
      "Return the revised prose only. Change what the findings name and leave everything else as it stands.",
  });

  const revised = {
    markdown: text,
    title: story.title,
    wordCount: countWords(text),
  };
  await putArtifact(context.db, {
    body: revised,
    inputKey,
    kind: "draft",
    sessionId: context.sessionId,
  });
  return revised;
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
