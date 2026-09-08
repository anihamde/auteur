import type { DialogueMarker } from "@auteur/core/prosody";

const COUNTERS: Readonly<Record<string, RegExp>> = {
  double: /"[^"\n]{2,}"|“[^”\n]{2,}”/g,
  "em-dash": /^[ \t]*[—–]\s*\p{Lu}/gmu,
  guillemet: /«[^»\n]{2,}»/g,
  single: /(?<![\p{L}])'[^'\n]{2,}'(?![\p{L}])|‘[^’\n]{2,}’/gu,
};

/**
 * Which convention a text marks speech with.
 *
 * The reason this exists: dialogue ratio is the fraction of words inside
 * quotation marks, which reports **zero** for a text that marks speech with an
 * em dash — as several translations and several modernists do. A zero that
 * looks like a measurement is worse than no measurement
 * (`docs/ARCHITECTURE.md` §4.2).
 *
 * A corpus mixing conventions across works reports `mixed`, and the UI says so
 * rather than showing a number that means nothing.
 */
export const detectDialogueMarker = (text: string): DialogueMarker => {
  const counts = Object.entries(COUNTERS).map(([kind, pattern]) => {
    pattern.lastIndex = 0;
    return [kind, [...text.matchAll(pattern)].length] as const;
  });

  const present = counts.filter(([, count]) => count > 0);
  if (present.length === 0) {
    return "none";
  }

  const sorted = [...present].sort((a, b) => b[1] - a[1]);
  const [top, second] = sorted;
  if (top === undefined) {
    return "none";
  }
  // A single stray quotation mark in an em-dash text should not make it mixed,
  // so the leader has to be genuinely ambiguous — within a factor of two — for
  // the answer to be that nothing can be measured.
  if (second !== undefined && second[1] * 2 > top[1]) {
    return "mixed";
  }
  return top[0] as DialogueMarker;
};

/** Combine per-work markers into the corpus's. */
export const combineMarkers = (
  markers: readonly DialogueMarker[],
): DialogueMarker => {
  const distinct = new Set(markers.filter((marker) => marker !== "none"));
  if (distinct.size === 0) {
    return "none";
  }
  if (distinct.size > 1 || distinct.has("mixed")) {
    return "mixed";
  }
  return [...distinct][0] ?? "none";
};
