import type { DialogueMarker } from "@auteur/core/prosody";
import { countWords } from "@auteur/text/tokenize";

const SPANS: Readonly<Record<string, RegExp>> = {
  double: /"([^"\n]*)"|“([^”\n]*)”/g,
  // A whole line beginning with an em dash is speech, to the end of the line
  // or to the next em dash — which is how the convention works in the
  // translations this corpus is made of.
  "em-dash": /^[ \t]*[—–][ \t]*([^\n]*)$/gm,
  guillemet: /«([^»\n]*)»/g,
  single: /(?<!\p{L})'([^'\n]*)'(?!\p{L})|‘([^’\n]*)’/gu,
};

export type DialogueRatio = {
  /** `undefined` when the convention is `mixed` or `none`. */
  readonly value: number | undefined;
  readonly marker: DialogueMarker;
};

/**
 * The fraction of words inside speech, measured against the convention the text
 * actually uses.
 *
 * The failure this shape exists to prevent: measuring against quotation marks
 * alone reports **0.0** for a text that marks speech with an em dash, and 0.0
 * looks like a measurement rather than like a mistake. So the marker comes in
 * as a parameter and the ratio is `undefined` when there is nothing meaningful
 * to measure against — `mixed`, because two conventions averaged together are
 * a number no prose has, and `none`, because a text with no dialogue has no
 * ratio rather than a ratio of zero.
 *
 * The distinction matters at the report: a `undefined` ratio is not scored,
 * where a zero would be scored and would fail.
 */
export const dialogueRatio = (
  text: string,
  marker: DialogueMarker,
): DialogueRatio => {
  if (marker === "mixed" || marker === "none") {
    return { marker, value: undefined };
  }
  const pattern = SPANS[marker];
  if (pattern === undefined) {
    return { marker, value: undefined };
  }
  const total = countWords(text);
  if (total === 0) {
    return { marker, value: 0 };
  }
  pattern.lastIndex = 0;
  const spoken = [...text.matchAll(pattern)].reduce(
    (sum, match) => sum + countWords(match[1] ?? match[2] ?? ""),
    0,
  );
  return { marker, value: Math.min(1, spoken / total) };
};
