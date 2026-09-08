import { tokenizeLower } from "@auteur/text/tokenize";

/**
 * The most frequent function words in English.
 *
 * Used only to drop bigrams where **both** halves are stopwords. Dropping any
 * bigram containing one would delete `the library`, `of dust` and `a mirror` —
 * which are exactly the pairs that carry a voice. Dropping only `of the` and
 * `in a` leaves the ones that say something.
 */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "i",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "she",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "was",
  "were",
  "which",
  "who",
  "will",
  "with",
  "you",
  "not",
  "no",
  "so",
  "if",
  "then",
  "than",
  "when",
  "what",
  "we",
  "us",
  "our",
  "my",
  "me",
  "him",
]);

const BIGRAM_COUNT = 25;

/**
 * The 25 most frequent adjacent word pairs, minus stopword-only pairs.
 *
 * Evidence for the drafting prompt, **not a scored measure** (§9.1): it is a
 * lexicon rather than a measurement, and there is no band a list of phrases can
 * be inside or outside of.
 *
 * Ties are broken alphabetically rather than by insertion order. Insertion
 * order depends on where in the corpus a phrase first appears, which makes the
 * output depend on work ordering — and a card that changes because its works
 * were fetched in a different order is not reproducible.
 */
export const commonBigrams = (text: string): readonly string[] => {
  const tokens = tokenizeLower(text);
  const counts = new Map<string, number>();

  for (let index = 0; index + 1 < tokens.length; index += 1) {
    const left = tokens[index] ?? "";
    const right = tokens[index + 1] ?? "";
    if (STOPWORDS.has(left) && STOPWORDS.has(right)) {
      continue;
    }
    const bigram = `${left} ${right}`;
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([leftText, leftCount], [rightText, rightCount]) =>
      leftCount === rightCount
        ? leftText.localeCompare(rightText)
        : rightCount - leftCount,
    )
    .slice(0, BIGRAM_COUNT)
    .map(([bigram]) => bigram);
};
