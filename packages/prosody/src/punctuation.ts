import type { PunctuationRates } from "@auteur/core/prosody";
import { countWords } from "@auteur/text/tokenize";

const PATTERNS: Readonly<Record<keyof PunctuationRates, RegExp>> = {
  colon: /:/g,
  // An ellipsis is one occurrence whether it is written as three dots or as
  // the single character. Counting the dots would report three times the rate
  // for a text set in ASCII and once for the same text set typographically.
  ellipsis: /…|\.{3}/g,
  emDash: /[—–]/g,
  exclamation: /!/g,
  question: /\?/g,
  // A semicolon inside an HTML entity is not punctuation. The cleaner should
  // have removed those, but a rate that silently counts `&amp;` is the kind of
  // thing that shows up as one author using ten times more semicolons than any
  // other.
  semicolon: /(?<!&[a-z]{2,8});/gi,
};

/**
 * Punctuation occurrences per 1,000 words.
 *
 * Per 1,000 words rather than per character or per sentence, so a corpus and a
 * 1,000-word story are directly comparable — which is the only reason any of
 * these numbers appear in the report.
 */
export const punctuationRates = (text: string): PunctuationRates => {
  const words = countWords(text);
  const per1k = (pattern: RegExp): number => {
    if (words === 0) {
      return 0;
    }
    pattern.lastIndex = 0;
    return ([...text.matchAll(pattern)].length / words) * 1000;
  };

  return {
    colon: per1k(PATTERNS.colon),
    ellipsis: per1k(PATTERNS.ellipsis),
    emDash: per1k(PATTERNS.emDash),
    exclamation: per1k(PATTERNS.exclamation),
    question: per1k(PATTERNS.question),
    semicolon: per1k(PATTERNS.semicolon),
  };
};
