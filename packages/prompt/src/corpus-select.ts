import type { Prompt } from "./versions.ts";

/**
 * `corpus-select` — which works, and why each.
 *
 * Given titles, years, word counts and a first passage per work. **Never full
 * texts**: the whole point of this stage is to choose what to download, and
 * sending the corpus to choose the corpus would cost what it exists to save.
 */

export type WorkSummary = {
  readonly id: string;
  readonly title: string;
  readonly year: number | null;
  readonly wordCount: number | null;
  readonly firstPassage: string;
};

export type CorpusSelectInput = {
  readonly authorName: string;
  readonly works: readonly WorkSummary[];
  readonly limit: number;
};

const workLine = (work: WorkSummary): string =>
  [
    `- id: ${work.id}`,
    `  title: ${work.title}`,
    `  year: ${work.year === null ? "unknown" : work.year.toString()}`,
    `  words: ${work.wordCount === null ? "unknown" : work.wordCount.toString()}`,
    `  opens: ${work.firstPassage.slice(0, 400)}`,
  ].join("\n");

export const corpusSelect: Prompt<CorpusSelectInput> = {
  build: (input) =>
    [
      `You are choosing which works by ${input.authorName} to measure a prose style from.`,
      "",
      "## What you are given",
      "",
      "A title, a year, a word count and an opening passage for each candidate.",
      "You are not given the full texts, and you do not need them: you are",
      "choosing what is worth downloading, not reading the corpus.",
      "",
      "## What to return",
      "",
      `At most ${input.limit.toString()} work ids, each with a one-line reason.`,
      "A reason is not a summary of the work. It says why this work earns a",
      "place in a sample of an author's prose, in the terms below.",
      "",
      "## Sample across career period and across form",
      "",
      "An author's prose changes over a working life, and it changes between a",
      "short story and a novel. A sample drawn from one decade, or from one",
      "form, measures that decade or that form and reports it as the author.",
      "Spread the selection across the years available and across the forms",
      "available, and prefer a spread to a set of the most famous titles.",
      "",
      "## Prefer a single translator where the choice exists",
      "",
      "A translation is the prose an English reader has, and two translators are",
      "two prose styles. Where the same author is available through more than",
      "one, choose works sharing a translator; where they are not, take what is",
      "there. Do not drop a work solely for having a different translator if",
      "dropping it would cost the spread.",
      "",
      "## The reason is shown to the reader",
      "",
      "Each reason is rendered as a line under the stage while it runs, so it",
      "names the work and the criterion it satisfies — the period it covers, the",
      "form it adds, the translator it shares. Write it as a statement a reader",
      "can check against the list above.",
      "",
      "## Candidates",
      "",
      input.works.map(workLine).join("\n"),
    ].join("\n"),
  id: "corpus-select",
  version: "corpus-select@1",
};
