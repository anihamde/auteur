import type { WorkProsody } from "@auteur/core/prosody";
import { CLAIM_PATHS, EXEMPLARS } from "@auteur/core/style-card";
import type { Prompt } from "./versions.ts";

/**
 * `style-extract` — the qualitative half of the card, cited to passages.
 *
 * The measured prosody is given as **evidence**, not as something to restate.
 * Invariant 1 says a measurement is never an opinion, and a model asked to
 * report a number it was handed will eventually report a different one.
 *
 * **It names the fields.** It used to describe the card in prose — "point of
 * view and narrator distance, register and diction, opening and closing moves"
 * — and never say that `path` takes one of twenty-two exact strings, that
 * every one of them is required for a card to build, or how many exemplars to
 * return. The model answered with no fields and one invented passage id, which
 * is a fair reading of what it was asked. The list comes from `CLAIM_PATHS`
 * rather than being retyped here, so a field added to the card reaches the
 * prompt on the same commit.
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

/**
 * The paths as the prompt lists them, from the card's own declaration.
 *
 * Split by what can evidence them, because the citation rule differs and a
 * single list forced one rule on both: told that an uncited claim was "honest
 * and useful", a model returned all twenty-two and cited fifteen — leaving
 * seven the assembler then refused to write, and no card at all.
 */
const fields = (evidence: "passage" | "corpus"): string =>
  CLAIM_PATHS.filter((claim) => claim.evidence === evidence)
    .map((claim) => `- \`${claim.path}\` (${claim.kind})`)
    .join("\n");

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
      "Two things: `fields`, one entry for **every** path listed below, and",
      `\`exemplars\`, between ${EXEMPLARS.min.toString()} and ${EXEMPLARS.max.toString()} passages worth quoting.`,
      "",
      "A card does not build unless every path below arrives. Returning fewer",
      "is not a shorter card, it is no card at all.",
      "",
      "### The paths, and the shape of each value",
      "",
      "`path` is one of these strings exactly. A path not on this list is",
      "discarded, and a path spelled differently is a path not on this list.",
      "A `line` takes one string. A `list` takes an array of strings.",
      "",
      "**These are read from a passage, and each one must cite it.** Pick the",
      "passage the reading came from and give its id. Every one of them is",
      "visible in a passage, so there is always one to point at.",
      "",
      fields("passage"),
      "",
      "**These are read from the corpus, and take `citationPassageId: null`.**",
      "They are absences and recurrences: no single passage shows what an",
      "author avoids, and no single passage establishes that an image recurs.",
      "Citing one would point at a passage that does not contain the thing",
      "being claimed. Return the reading, and return it with null.",
      "",
      fields("corpus"),
      "",
      'A good value is specific enough to be wrong. "Formal register" is not a',
      'reading; "a register that reaches for the Latinate abstraction where a',
      'concrete noun would do" is one, and a passage can be pointed at.',
      "",
      "### Exemplars",
      "",
      `Between ${EXEMPLARS.min.toString()} and ${EXEMPLARS.max.toString()} of them, each naming a passage id from the list`,
      "below and saying in one line what that passage demonstrates. The id is",
      "copied from a heading, never composed: an exemplar is nothing but its",
      "citation, so one naming a passage nobody offered is dropped entirely.",
      "",
      "## Cite what you can point at, and nothing else",
      "",
      "A citation is a passage id copied from a heading below, never composed.",
      "A claim citing a passage that does not support it is worse than no claim,",
      "because a reader who follows the citation stops trusting the ones that",
      "are right — so where the reading is genuinely of the corpus rather than",
      "of a passage, null is the honest answer and the list above says which",
      "those are.",
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
  version: "style-extract@3",
};
