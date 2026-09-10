import { EXEMPLARS } from "@auteur/core/style-card";
import { type CandidatePassage, passageBlock } from "./style-fields.ts";
import type { Prompt } from "./versions.ts";

/**
 * `style-extract` — the exemplars, and only those.
 *
 * The second of two passes. It used to return the readings as well, and one
 * call doing both needed more than the sixty seconds an invocation gets: about
 * fifty against nine short passages and a timeout on the deployment against
 * forty long ones. `style-fields` returns the readings; this picks the passages
 * that demonstrate them.
 *
 * **It is given those readings.** An exemplar says what a passage demonstrates,
 * and what it demonstrates is one of them — asking for exemplars without them
 * would be asking for passages that are merely interesting.
 */

export type StyleExtractInput = {
  readonly authorName: string;
  readonly passages: readonly CandidatePassage[];
  /** What `style-fields` read, as `path: value` lines. */
  readonly readings: readonly {
    readonly path: string;
    readonly value: string;
  }[];
};

const readings = (input: StyleExtractInput["readings"]): string =>
  input.map((claim) => `- \`${claim.path}\`: ${claim.value}`).join("\n");

export const styleExtract: Prompt<StyleExtractInput> = {
  build: (input) =>
    [
      `You are choosing the passages that best demonstrate ${input.authorName}'s style.`,
      "",
      "## What you are given",
      "",
      "The readings already taken from this corpus, and the passages they were",
      "taken from. Each passage carries an id.",
      "",
      "### The readings",
      "",
      readings(input.readings),
      "",
      "## What to return",
      "",
      `\`exemplars\`: between ${EXEMPLARS.min.toString()} and ${EXEMPLARS.max.toString()} of them, each naming a passage`,
      "id from the list below and saying in one line what that passage",
      "demonstrates.",
      "",
      "**Say what it demonstrates, not what it is about.** A passage summarised",
      "is a passage nobody needs the card to find; a passage whose sentence says",
      '"the semicolon holds two clauses that would otherwise be a comma splice"',
      "is one a reader can check against the reading it supports.",
      "",
      "Spread them across the works rather than taking several from one: the",
      "card is a claim about a career, and eight exemplars from one novel is a",
      "claim about that novel.",
      "",
      "## The id is copied, never composed",
      "",
      "An exemplar is nothing but its citation, so one naming a passage nobody",
      "offered is dropped entirely — the reader follows it to nothing, and a",
      "reader who follows one dead citation stops trusting the ones that work.",
      "",
      "## Passages",
      "",
      input.passages.map(passageBlock).join("\n\n"),
    ].join("\n"),
  id: "style-extract",
  version: "style-extract@4",
};
