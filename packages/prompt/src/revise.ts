import type { Prompt } from "./versions.ts";

/**
 * `revise` — targeted, against named measures.
 *
 * Two paths: the whole draft against findings, or a marked span with context.
 * The second is the reader selecting a paragraph and asking for it again, and
 * it is the one that must not rewrite anything else.
 */

export type Remedy = {
  readonly path: string;
  readonly finding: string;
  readonly remedy: string;
};

export type ReviseInput = {
  readonly authorName: string;
  readonly cardSummary: string;
  readonly remedies: readonly Remedy[];
  readonly draft: string;
  /** Present on the selection path: the exact text to replace. */
  readonly span?: string;
  /** Present on the selection path: roughly 300 words either side. */
  readonly before?: string;
  readonly after?: string;
};

export const revise: Prompt<ReviseInput> = {
  build: (input) =>
    [
      `You are revising prose against measured findings for ${input.authorName}.`,
      "",
      "### The style card",
      "",
      input.cardSummary,
      "",
      "### What to fix",
      "",
      input.remedies
        .map(
          (remedy) =>
            `- ${remedy.path}: ${remedy.finding}\n  remedy: ${remedy.remedy}`,
        )
        .join("\n"),
      "",
      ...(input.span === undefined
        ? ["### The draft", "", input.draft, ""]
        : [
            "### Before the marked span",
            "",
            input.before ?? "(the story opens here)",
            "",
            "### The marked span",
            "",
            input.span,
            "",
            "### After the marked span",
            "",
            input.after ?? "(the story ends here)",
            "",
          ]),
      "## What to return",
      "",
      "The revised markdown, and the list of findings you actually acted on.",
      "",
      "## Revise against these measures, not toward better writing",
      "",
      "Each finding above names a path and a number. Change what those name and",
      'leave the rest alone. "Improve the style" is not the instruction and is',
      "not an improvement that can be checked: the report will re-measure, and a",
      "revision that moved a number nobody asked about is drift you introduced.",
      "",
      "A finding you did not act on is reported as not acted on. That is a",
      "legitimate outcome — a remedy can cost more than the drift — and it is",
      "better than a change nobody can trace to a reason.",
      ...(input.span === undefined
        ? []
        : [
            "",
            "## Replace only the marked span",
            "",
            "The text before and after it is given so the replacement joins",
            "cleanly. Return the whole document with the span replaced and every",
            "other sentence identical, character for character. A revision that",
            "touched a paragraph the reader did not select is one they cannot",
            "undo.",
          ]),
    ].join("\n"),
  id: "revise",
  version: "revise@1",
};
