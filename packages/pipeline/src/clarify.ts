import { AuteurError } from "@auteur/errors/auteur-error";
import { z } from "zod";

/**
 * `clarify`'s budget and its re-entry, `ARCHITECTURE.md` §6.5.
 *
 * **The budget is the engine's, not the prompt's.** Three rounds and eight
 * questions, counted here and enforced by truncating the round rather than by
 * asking the model to behave. A prompt-level budget is a suggestion, and
 * `PRD.md` §6 calls the budget the thing that makes this a wizard rather than a
 * conversation — so it is a constant in code with a test.
 */

export const MAX_ROUNDS = 3;
export const MAX_QUESTIONS = 8;

/**
 * What the stage returns.
 *
 * `decision` and `whyNotSettled` are required non-empty strings, and that is
 * `PRD.md` §6's "a question that cannot state its purpose is not asked" as a
 * **parse failure** rather than a prompt instruction. A question without them
 * never reaches the UI, because it cannot be parsed.
 */
export const clarifyQuestionSchema = z.object({
  decision: z.string().min(8),
  dependsOn: z.array(z.string()).default([]),
  suggestions: z.array(z.string().min(1)).min(2).max(4),
  text: z.string().min(1),
  whyNotSettled: z.string().min(16),
});
export type ClarifyQuestion = z.infer<typeof clarifyQuestionSchema>;

export const clarifyResultSchema = z.object({
  done: z.boolean(),
  questions: z.array(clarifyQuestionSchema),
});
export type ClarifyResult = z.infer<typeof clarifyResultSchema>;

export const parseClarifyResult = (payload: unknown): ClarifyResult => {
  const parsed = clarifyResultSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AuteurError(
      "schema_violation",
      "The clarify stage returned questions that cannot be asked.",
      { detail: { issues: parsed.error.issues } },
    );
  }
  return parsed.data;
};

export type PriorQuestion = {
  readonly id: string;
  readonly answer: string | null;
  readonly answerState: string;
};

/**
 * Whether a round-2-or-3 question is grounded in what was answered.
 *
 * "The idea does not specify a frame" is a valid reason in round 1 and a
 * non-answer in round 3: by then the reader has answered something, and a
 * question that does not reference it is one the model could have asked before
 * reading their answers. So a later-round question must name an answered
 * question's id, or quote a phrase from an answer.
 *
 * The quote check is a word-level containment rather than a substring: a
 * substring match on short answers ("yes") fires on almost any sentence.
 */
export const referencesAnswers = (
  question: ClarifyQuestion,
  answered: readonly PriorQuestion[],
): boolean => {
  if (
    question.dependsOn.some((id) => answered.some((prior) => prior.id === id))
  ) {
    return true;
  }
  const haystack = question.whyNotSettled.toLowerCase();
  return answered.some((prior) => {
    if (prior.answer === null) return false;
    const words = prior.answer
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 4);
    return words.length > 0 && words.every((word) => haystack.includes(word));
  });
};

export type RoundInput = {
  readonly result: ClarifyResult;
  readonly round: number;
  readonly askedSoFar: number;
  readonly answered: readonly PriorQuestion[];
};

export type Round = {
  readonly questions: readonly ClarifyQuestion[];
  /** True when the budget or the stage says there is nothing more to ask. */
  readonly done: boolean;
  readonly dropped: readonly { readonly text: string; readonly why: string }[];
};

/**
 * Apply the budget and the grounding rule to one round.
 *
 * Truncation rather than refusal: a stage that returned five questions with two
 * left in the budget has produced three usable ones, and discarding the round
 * would spend a model call to ask nothing.
 */
export const applyBudget = (input: RoundInput): Round => {
  const dropped: { text: string; why: string }[] = [];
  const grounded = input.result.questions.filter((question) => {
    if (input.round === 1) return true;
    if (referencesAnswers(question, input.answered)) return true;
    dropped.push({
      text: question.text,
      why: "a later round's question must reference what was already answered",
    });
    return false;
  });

  const remaining = Math.max(MAX_QUESTIONS - input.askedSoFar, 0);
  const questions = grounded.slice(0, remaining);
  for (const question of grounded.slice(remaining)) {
    dropped.push({ text: question.text, why: "the question budget is spent" });
  }

  return {
    done:
      input.result.done ||
      input.round >= MAX_ROUNDS ||
      input.askedSoFar + questions.length >= MAX_QUESTIONS,
    dropped,
    questions,
  };
};
