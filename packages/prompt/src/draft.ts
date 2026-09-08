import type { LengthPreset } from "@auteur/core/session";
import type { Prompt } from "./versions.ts";

/**
 * `draft` — the prose. The one untyped stage.
 *
 * Untyped because prose is not a schema, and asking for it inside a JSON string
 * would put an escaping problem between the model and the story.
 */

export type Exemplar = {
  readonly workTitle: string;
  readonly demonstrates: string;
  readonly text: string;
};

export type Beat = { readonly index: number; readonly text: string };

export type DraftInput = {
  readonly title: string;
  readonly beats: readonly Beat[];
  readonly authorName: string;
  readonly cardSummary: string;
  readonly targets: string;
  readonly antiPatterns: readonly string[];
  readonly lengthPreset: LengthPreset;
  readonly wordTarget: number;
  readonly exemplars: readonly Exemplar[];
  /** Present under `sequential-scene`: what earlier scenes established. */
  readonly continuity?: string;
  /** Present under `sequential-scene`: the beats this call is to write. */
  readonly scope?: readonly Beat[];
};

const exemplarBlock = (exemplar: Exemplar): string =>
  [
    `### ${exemplar.workTitle} — ${exemplar.demonstrates}`,
    "",
    exemplar.text,
  ].join("\n");

export const draft: Prompt<DraftInput> = {
  build: (input) =>
    [
      `You are writing prose in the measured style of ${input.authorName}.`,
      "",
      "## What you are given",
      "",
      `- title: ${input.title}`,
      `- length: ${input.lengthPreset}, about ${input.wordTarget.toLocaleString("en-US")} words`,
      "",
      "### The style card",
      "",
      input.cardSummary,
      "",
      "### Measured targets",
      "",
      input.targets,
      "",
      ...(input.continuity === undefined
        ? []
        : ["### What earlier scenes established", "", input.continuity, ""]),
      "### Beats",
      "",
      (input.scope ?? input.beats)
        .map((beat) => `${beat.index.toString()}. ${beat.text}`)
        .join("\n"),
      "",
      "## What to return",
      "",
      "The prose, as markdown. Nothing else — no preamble, no notes on what you",
      "did, no heading naming the beats.",
      "",
      "## The targets describe a corpus, not a quota",
      "",
      "The numbers above were measured across this author's works. They are what",
      "the prose should aim at, and they are not a budget to spend. Where",
      "hitting a target would cost the story its coherence at this length — not",
      "enough words to carry sentences of that length, a beat that cannot be",
      "told in the sentence count available — the story wins, and the drift is",
      "expected and will be reported.",
      "",
      "Do not pad to reach a mean. Do not split a sentence that wants to be one.",
      "The report exists to say where the prose departed from the corpus and",
      "why; it does not exist to be satisfied.",
      "",
      "## The anti-patterns are prohibitions",
      "",
      "These are not suggestions and not a stylistic preference. They are what",
      "the measured author does not do, and a draft that does them is not in",
      "this style however well it reads:",
      "",
      ...input.antiPatterns.map((pattern) => `- ${pattern}`),
      "",
      "## Do not write the provenance label",
      "",
      "Every story this product renders carries a line saying it was generated",
      "and by whom. That line is added when the document is rendered, and it is",
      "required there. Writing your own version of it here produces two, and the",
      "one you write is not the one the export guarantees.",
      "",
      "## Exemplars",
      "",
      "Passages from the author's own work, verbatim. They are evidence of what",
      "the card describes, not text to reuse: do not quote them, do not echo",
      "their sentences, do not lift their images.",
      "",
      input.exemplars.map(exemplarBlock).join("\n\n"),
    ].join("\n"),
  id: "draft",
  version: "draft@1",
};
