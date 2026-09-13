import type { LengthPreset } from "@auteur/core/session";
import type { Prompt } from "./versions.ts";

/**
 * `story` — the prose. The one untyped stage.
 *
 * Untyped because prose is not a schema, and asking for it inside a JSON string
 * would put an escaping problem between the model and the story.
 *
 * It writes the story **and it rewrites it**. There is no separate revision
 * prompt, because a revision differs from a first attempt in exactly one way:
 * there is a previous attempt and there is something the reader said about it.
 * Both are inputs here, and the stage that had been `draft`, `critique` and
 * `revise` is this one call.
 */

export type Exemplar = {
  readonly workTitle: string;
  readonly demonstrates: string;
  readonly text: string;
};

export type Beat = { readonly index: number; readonly text: string };

export type StoryInput = {
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
  /**
   * What the reader has asked for and this prompt has not yet been told.
   *
   * Oldest first, and only the ones not already applied: a note the story in
   * `previousStory` was written from would be applied twice, which for "cut the
   * second scene to half" is a scene at a quarter.
   */
  readonly notes?: readonly string[];
  /**
   * The story those notes are about, when there is one.
   *
   * Present without `notes` never happens — there would be nothing to change —
   * but `notes` without this does: a note filed before the story was first
   * written is an instruction for writing it, and dropping it would consume the
   * note without using it.
   */
  readonly previousStory?: string;
};

const exemplarBlock = (exemplar: Exemplar): string =>
  [
    `### ${exemplar.workTitle} — ${exemplar.demonstrates}`,
    "",
    exemplar.text,
  ].join("\n");

export const story: Prompt<StoryInput> = {
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
      ...(input.previousStory === undefined
        ? []
        : ["### The story as it stands", "", input.previousStory, ""]),
      ...(input.notes === undefined || input.notes.length === 0
        ? []
        : [
            "### What the reader asked for",
            "",
            "In their words, oldest first. Every one of them: a later note adds",
            "to the earlier ones and does not replace them.",
            "",
            ...input.notes.map((note) => `- ${note}`),
            "",
          ]),
      "## What to return",
      "",
      ...(input.previousStory === undefined
        ? [
            "The prose, as markdown. Nothing else — no preamble, no notes on",
            "what you did, no heading naming the beats.",
          ]
        : [
            "The story again, whole, as markdown. Change what the reader asked",
            "for and leave the rest as it stands — this is a revision and not a",
            "second attempt, and a sentence they did not mention is a sentence",
            "they were content with.",
            "",
            "Nothing else — no preamble, no notes on what you changed, no",
            "heading naming the beats.",
          ]),
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
  id: "story",
  version: "story@2",
};
