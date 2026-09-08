import type { LengthPreset } from "@auteur/core/session";
import type { PriorAnswer } from "./clarify.ts";
import type { Prompt } from "./versions.ts";

/**
 * `outline` — the beat sheet, and the choices nobody asked about.
 *
 * The second return is the one that matters: a decisions log that recorded only
 * what the reader answered would be a log of what they already know.
 */

export type OutlineInput = {
  readonly idea: string;
  readonly constraints: string | null;
  readonly lengthPreset: LengthPreset;
  readonly wordTarget: number;
  readonly authorName: string;
  readonly cardSummary: string;
  readonly answers: readonly PriorAnswer[];
};

export const outline: Prompt<OutlineInput> = {
  build: (input) =>
    [
      "You are writing a beat sheet for a story to be drafted in a measured",
      "author's style.",
      "",
      "## What you are given",
      "",
      `- idea: ${input.idea}`,
      `- constraints: ${input.constraints ?? "none"}`,
      `- length: ${input.lengthPreset}, about ${input.wordTarget.toLocaleString("en-US")} words`,
      `- author: ${input.authorName}`,
      "",
      "### The style card",
      "",
      input.cardSummary,
      "",
      "### Answers, including the skips",
      "",
      input.answers.length === 0
        ? "(none)"
        : input.answers
            .map(
              (answer) =>
                `- ${answer.question}\n  answer: ${answer.answer ?? "skipped — you choose"}`,
            )
            .join("\n"),
      "",
      "## What to return",
      "",
      "A title and an ordered list of beats, and separately the choices you made",
      "that no question covered.",
      "",
      "## Return every choice you made that no question covered",
      "",
      "A skipped question is a choice you made and the reader knows they skipped",
      "it. A choice nobody asked about is one they will meet for the first time",
      "in the finished story — the narrator's distance, whether the comet is",
      "seen, what the last line is doing. Return those, each with the reason.",
      "They become the decisions log, and the log is honest only if it holds the",
      "decisions the reader did not know were being made.",
      "",
      "## The beat count follows the word target",
      "",
      "A beat is a scene or a movement, and it needs room. At about",
      `${input.wordTarget.toLocaleString("en-US")} words, a beat has roughly`,
      `${Math.max(Math.round(input.wordTarget / 6), 60).toLocaleString("en-US")} words`,
      "if there are six of them. Choose a count the length can carry: fewer,",
      "longer beats at flash length; more at novelette. A beat sheet with",
      "twenty beats for a thousand words is a synopsis, not an outline.",
    ].join("\n"),
  id: "outline",
  version: "outline@1",
};
