import type { LengthPreset } from "@auteur/core/session";
import type { Prompt } from "./versions.ts";

/**
 * `clarify` — questions that name the decision they resolve.
 *
 * The one stage that re-enters itself. Its budget is three rounds and about
 * eight questions, and the budget belongs to the engine rather than to this
 * prompt: a prompt asked to police its own count will pad to it.
 */

export type PriorAnswer = {
  readonly question: string;
  readonly decision: string;
  readonly answer: string | null;
};

export type ClarifyInput = {
  readonly idea: string;
  readonly constraints: string | null;
  readonly lengthPreset: LengthPreset;
  readonly authorName: string;
  readonly cardSummary: string;
  readonly answers: readonly PriorAnswer[];
  readonly round: number;
};

const answerLine = (answer: PriorAnswer): string =>
  `- ${answer.question}\n  decides: ${answer.decision}\n  answer: ${answer.answer ?? "skipped — you choose"}`;

export const clarify: Prompt<ClarifyInput> = {
  build: (input) =>
    [
      "You are asking the questions the idea left open, before a story is",
      "outlined in a measured author's style.",
      "",
      "## What you are given",
      "",
      `- idea: ${input.idea}`,
      `- constraints: ${input.constraints ?? "none"}`,
      `- length: ${input.lengthPreset}`,
      `- author: ${input.authorName}`,
      `- round: ${input.round.toString()}`,
      "",
      "### The style card",
      "",
      input.cardSummary,
      "",
      "### Answers so far",
      "",
      input.answers.length === 0
        ? "(none — this is the first round)"
        : input.answers.map(answerLine).join("\n"),
      "",
      "## What to return",
      "",
      "Questions, and whether you have enough to proceed. Each question carries",
      "the decision it resolves, why the answers so far did not settle it, and",
      "two to four suggested answers.",
      "",
      "## Every question states the decision it resolves",
      "",
      "A question that cannot name the decision it resolves is not asked. Not",
      '"tell me more about the tone" — that names no decision and no answer to',
      "it changes what gets written. Name the fork: which of two frames the",
      "story takes, whether the comet is seen or only reported, whose account",
      "the reader is inside.",
      "",
      "Say why the answers so far did not settle it. If they did, do not ask.",
      "",
      "## Ask from the card, not from a checklist",
      "",
      'A question that would be asked of any author is not asked. "What point of',
      'view?" is a form to fill in. "The corpus opens inside a review, a',
      "catalogue or a footnote in most of the works measured, and your idea",
      "names a man and a comet but no frame\" is a question this author's prose",
      "produced, and it is the only kind worth a reader's attention.",
      "",
      "## Suggestions are concrete",
      "",
      "Two to four options, each a thing the story could actually be.",
      'Never "it depends", never "any of the above", never a suggestion that',
      "restates the question. The reader picks one or skips; a skip is recorded",
      "and you choose, so a vague option is a decision nobody made.",
    ].join("\n"),
  id: "clarify",
  version: "clarify@1",
};
