/**
 * A token is a maximal run of letters, digits, apostrophes and internal
 * hyphens, Unicode-aware, with a leading or trailing apostrophe stripped.
 *
 * **Not `split(/\s+/)`.** `docs/ARCHITECTURE.md` §4.2 names this as one of the
 * four things a naive implementation gets wrong: em-dash-joined words,
 * ellipses and quotation marks all attach to tokens under a whitespace split
 * and inflate every per-1,000-word rate by a few percent — enough to move a
 * band verdict and not enough to notice.
 *
 * Unicode-aware because the corpus is translations: `café`, `naïve` and
 * `Ægypt` are one token each, and a `[a-z]` class would cut them in half.
 */
const TOKEN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export const tokenize = (text: string): readonly string[] =>
  [...text.matchAll(TOKEN)].map((match) => match[0]);

export const countWords = (text: string): number => {
  let count = 0;
  TOKEN.lastIndex = 0;
  while (TOKEN.exec(text) !== null) {
    count += 1;
  }
  return count;
};

/** Lowercased tokens, for the measures that are about types rather than order. */
export const tokenizeLower = (text: string): readonly string[] =>
  tokenize(text).map((token) => token.toLowerCase());
