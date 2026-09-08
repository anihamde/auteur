import { tokenizeLower } from "@auteur/text/tokenize";
import { GERMANIC_EXCEPTIONS, LATINATE_SUFFIXES } from "./latinate-lists.ts";

const EXCEPTIONS = new Set(GERMANIC_EXCEPTIONS);

/**
 * Whether a word looks Latinate, by suffix, with a Germanic exception list.
 *
 * A declared proxy. Its verdict on any one word is often wrong; what it is for
 * is a *rate over a whole text*, applied identically to the corpus and to the
 * draft, so that the comparison means something even where the classifier does
 * not. That is why it is a proxy and not a mistake — and why every verdict it
 * produces carries a `classifier` block saying so.
 *
 * Words of three letters or fewer are never classified: `all`, `ate` and `ic`
 * are suffixes standing alone, and a rule that fires on them would classify a
 * large share of the most frequent words in English.
 */
export const isLatinate = (word: string): boolean => {
  const lower = word.toLowerCase();
  if (lower.length <= 3 || EXCEPTIONS.has(lower)) {
    return false;
  }
  return LATINATE_SUFFIXES.some(
    (suffix) => lower.length > suffix.length + 2 && lower.endsWith(suffix),
  );
};

/**
 * The fraction of tokens the classifier calls Latinate.
 *
 * **Exhaustive, not sampled** (§4.3). Every token in the corpus is classified
 * in one pass — a set lookup per word, so a million words is milliseconds.
 * Sampling would buy nothing and cost reproducibility, and reproducibility is
 * what makes a cached card comparable to a draft measured later.
 */
export const latinateRatio = (text: string): number => {
  const tokens = tokenizeLower(text);
  if (tokens.length === 0) {
    return 0;
  }
  const latinate = tokens.filter(isLatinate).length;
  return latinate / tokens.length;
};

export type PrecisionReport = {
  readonly precision: number;
  readonly recall: number;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  readonly total: number;
};

/** Score the classifier against a labelled set of word types. */
export const scoreClassifier = (
  labelled: readonly { readonly type: string; readonly latinate: boolean }[],
): PrecisionReport => {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const entry of labelled) {
    const predicted = isLatinate(entry.type);
    if (predicted && entry.latinate) {
      truePositives += 1;
    } else if (predicted && !entry.latinate) {
      falsePositives += 1;
    } else if (!predicted && entry.latinate) {
      falseNegatives += 1;
    }
  }

  const predicted = truePositives + falsePositives;
  const actual = truePositives + falseNegatives;
  return {
    falseNegatives,
    falsePositives,
    precision: predicted === 0 ? 0 : truePositives / predicted,
    recall: actual === 0 ? 0 : truePositives / actual,
    total: labelled.length,
    truePositives,
  };
};
