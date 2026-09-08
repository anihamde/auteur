import type { Prompt } from "./versions.ts";

/**
 * `critique` — findings against the card and the measures.
 *
 * The engine drops a finding with no digit in it. That is stated in the prompt
 * so a wasted finding is a wasted finding rather than a surprise, and it is
 * enforced downstream so the statement is not the only thing holding.
 */

export type MeasureLine = {
  readonly path: string;
  readonly value: string;
  readonly target: string;
  readonly status: string;
};

export type CritiqueInput = {
  readonly authorName: string;
  readonly cardSummary: string;
  readonly measures: readonly MeasureLine[];
  readonly draft: string;
};

export const critique: Prompt<CritiqueInput> = {
  build: (input) =>
    [
      `You are reading a draft against a measured style card for ${input.authorName}.`,
      "",
      "## What you are given",
      "",
      "The card, the measures already computed against the corpus, and the",
      "draft.",
      "",
      "### The style card",
      "",
      input.cardSummary,
      "",
      "### Measures",
      "",
      input.measures
        .map(
          (measure) =>
            `- ${measure.path}: ${measure.value} against ${measure.target} — ${measure.status}`,
        )
        .join("\n"),
      "",
      "### The draft",
      "",
      input.draft,
      "",
      "## What to return",
      "",
      "Findings. Each names a path, states a number and its consequence, and",
      "says what a revision would do about it.",
      "",
      "## Every finding states a number and its consequence",
      "",
      "A finding without a digit in it is dropped by the engine, so one without",
      'a number is a wasted finding. Not "the sentences feel short" — "sentences',
      "run a mean of 18.2 against 28.4 in the corpus; the corpus holds two",
      "clauses in one breath where this draft takes two sentences, so the",
      'rhythm the card describes never arrives."',
      "",
      "The number is the argument. The consequence is what makes it worth",
      "acting on: say what the prose loses, not that a value differs.",
      "",
      "## Cite a path that exists",
      "",
      "Every finding names a path from the card or from the measures above —",
      "`voice.narratorDistance`, `prosodyTarget.sentenceLength.mean`. A path",
      "nothing carries cannot be rendered beside the value it is about, and the",
      "reader gets a claim with nothing to check it against.",
    ].join("\n"),
  id: "critique",
  version: "critique@1",
};
