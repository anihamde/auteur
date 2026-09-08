import type { WorkProsody } from "@auteur/core/prosody";
import type { Prompt } from "./versions.ts";

/**
 * `style-extract` — the qualitative half of the card, cited to passages.
 *
 * The measured prosody is given as **evidence**, not as something to restate.
 * Invariant 1 says a measurement is never an opinion, and a model asked to
 * report a number it was handed will eventually report a different one.
 */

export type CandidatePassage = {
  readonly id: string;
  readonly workTitle: string;
  readonly text: string;
};

export type StyleExtractInput = {
  readonly authorName: string;
  readonly prosody: WorkProsody;
  readonly passages: readonly CandidatePassage[];
};

const passageBlock = (passage: CandidatePassage): string =>
  [`### ${passage.id} — ${passage.workTitle}`, "", passage.text].join("\n");

const measured = (prosody: WorkProsody): string =>
  [
    `- sentence length: mean ${prosody.sentenceLength.mean.toString()}, p10 ${prosody.sentenceLength.p10.toString()}, p90 ${prosody.sentenceLength.p90.toString()}`,
    `- semicolons per thousand words: ${prosody.punctuation.semicolon.toString()}`,
    `- em dashes per thousand words: ${prosody.punctuation.emDash.toString()}`,
    `- dialogue ratio: ${prosody.dialogueRatio.toString()}`,
    `- type-token ratio (MATTR): ${prosody.mattr.toString()}`,
    `- latinate ratio: ${prosody.latinateRatio.toString()} (suffix proxy)`,
  ].join("\n");

export const styleExtract: Prompt<StyleExtractInput> = {
  build: (input) =>
    [
      `You are describing the prose style of ${input.authorName} from evidence.`,
      "",
      "## What you are given",
      "",
      "The prosody of the corpus, already measured by code, and passages drawn",
      "from the selected works. Each passage carries an id.",
      "",
      "### Measured prosody",
      "",
      measured(input.prosody),
      "",
      "## What to return",
      "",
      "The qualitative half of a style card: point of view and narrator",
      "distance, register and diction, opening and closing moves, recurring",
      "images, and the patterns this author avoids. Each field is a claim, and",
      "each claim carries the passage it was read from.",
      "",
      'A good value is specific enough to be wrong. "Formal register" is not a',
      'reading; "a register that reaches for the Latinate abstraction where a',
      'concrete noun would do" is one, and a passage can be pointed at.',
      "",
      "## Cite what you can point at, and nothing else",
      "",
      "Every field you return is either backed by a passage id from the list",
      "below, or returned with no citation at all. A field you cannot point at a",
      "passage for is returned without a citation, never with an invented one.",
      "An uncited claim is honest and useful; a claim citing a passage that does",
      "not support it is worse than no claim, because a reader who follows the",
      "citation stops trusting the ones that are right.",
      "",
      "## Do not restate the prosody",
      "",
      "The measured block above is given as evidence for your reading. It is",
      "already on the card, computed from the full texts. Do not return any of",
      'its numbers as a claim, and do not describe the author as writing "long',
      'sentences" when the number is there — say what the length is doing.',
      "",
      "## Passages",
      "",
      input.passages.map(passageBlock).join("\n\n"),
    ].join("\n"),
  id: "style-extract",
  version: "style-extract@1",
};
