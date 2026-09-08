/**
 * Abbreviations whose full stop does not end a sentence.
 *
 * **Data, not code**, and part of the segmenter's version: changing this list
 * changes every sentence-length measure ever computed, so `version.ts` hashes
 * it and a change invalidates every cached card. That is the correct and cheap
 * outcome — the cleaned texts are stored, so a rebuild recomputes from disk
 * with no model call and no network (`docs/ARCHITECTURE.md` §4.2).
 *
 * English-and-translation shaped, which is what the corpus is (§5.2). A
 * non-English tier is a `text` package per language, not a flag.
 */
export const ABBREVIATIONS: readonly string[] = [
  // Titles
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "rev",
  "hon",
  "st",
  "sr",
  "jr",
  "capt",
  "col",
  "gen",
  "lt",
  "sgt",
  "fr",
  "msgr",
  // Latin and editorial
  "etc",
  "i.e",
  "e.g",
  "cf",
  "viz",
  "vs",
  "al",
  "ibid",
  "op",
  "cit",
  // Measures and references
  "no",
  "vol",
  "ch",
  "pp",
  "ed",
  "fig",
  "approx",
  // Places and dates that appear in nineteenth-century prose
  "co",
  "inc",
  "ltd",
  "mt",
  "ft",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sept",
  "sep",
  "oct",
  "nov",
  "dec",
];

const ABBREVIATION_SET = new Set(ABBREVIATIONS);

/**
 * Whether the word ending at a full stop is an abbreviation.
 *
 * A single letter is treated as an initial — `J. L. Borges` is one sentence,
 * and an author's name splitting into three is a failure that shows up as a
 * corpus of very short sentences.
 */
export const isAbbreviation = (word: string): boolean => {
  const lower = word.toLowerCase();
  if (lower.length === 1 && /\p{L}/u.test(lower)) {
    return true;
  }
  return ABBREVIATION_SET.has(lower);
};
