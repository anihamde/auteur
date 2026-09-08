import { ABBREVIATIONS } from "./abbreviations.ts";
import { GUTENBERG_MARKERS } from "./clean.ts";

/**
 * Version strings derived from the data that decides the output.
 *
 * **Derived, not hand-edited.** A hand-written version string is one someone
 * forgets to bump, and the consequence is silent: a card built with one
 * abbreviation list, compared against a draft measured with another, with no
 * sign that the two numbers are not comparable. Hashing the data makes the bump
 * automatic and makes "did this change?" a question the code answers.
 *
 * Cleaner and segmenter version separately, because re-cleaning requires
 * re-fetching and re-segmenting does not (`docs/ARCHITECTURE.md` §4.2).
 */
const hash = (parts: readonly string[]): string =>
  Bun.hash(parts.join(" ")).toString(16).padStart(8, "0").slice(0, 8);

/** Changing this invalidates `works.cleaner_version` and forces a re-fetch. */
export const cleanerVersion = (): string =>
  `clean-${hash(GUTENBERG_MARKERS.flat())}`;

/**
 * Changing this invalidates every cached card — which is correct and cheap,
 * because the cleaned texts are stored and a rebuild recomputes prosody from
 * disk with no model call and no network.
 */
export const segmenterVersion = (): string => `seg-${hash(ABBREVIATIONS)}`;
