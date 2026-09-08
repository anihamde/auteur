/**
 * Undo Project Gutenberg's hard wrap.
 *
 * The failure this exists to prevent, from `docs/ARCHITECTURE.md` §4.2: plain
 * text Gutenberg files are wrapped at roughly 70 columns, and treating a
 * **line** as a paragraph reports a mean paragraph length near ten words for
 * every author who ever lived. The number looks plausible, which is what makes
 * it dangerous.
 *
 * Lines within a blank-line-separated block are joined, except where the break
 * is real:
 *
 *  - **Verse.** A block whose lines are consistently short and mostly
 *    capitalised is not prose wrapped at 70 columns; joining it would turn a
 *    poem into one long sentence.
 *  - **A terminator followed by an indented line.** In a hard-wrapped file a
 *    continuation starts at the margin; an indent after a full stop is the
 *    author's break, not the wrapper's.
 */
const VERSE_MAX_MEAN = 45;

const looksLikeVerse = (lines: readonly string[]): boolean => {
  if (lines.length < 2) {
    return false;
  }
  const lengths = lines.map((line) => line.trim().length);
  const mean = lengths.reduce((sum, length) => sum + length, 0) / lines.length;
  if (mean > VERSE_MAX_MEAN) {
    return false;
  }
  // Wrapped prose continues mid-sentence, so most of its lines start lowercase.
  // Verse starts most lines with a capital.
  const capitalised = lines.filter((line) =>
    /^["'“‘(]?\p{Lu}/u.test(line.trim()),
  ).length;
  return capitalised / lines.length > 0.6;
};

const endsSentence = (line: string): boolean =>
  /[.!?]["'”’)]?\s*$|…\s*$/.test(line);

const isIndented = (line: string): boolean => /^[ \t]{2,}/.test(line);

/** One block's lines, joined into a paragraph unless the breaks are real. */
const unwrapBlock = (block: string): string => {
  const lines = block.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    return "";
  }
  if (looksLikeVerse(lines)) {
    return lines.map((line) => line.trim()).join("\n");
  }

  const out: string[] = [];
  let current = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (current === "") {
      current = trimmed;
      continue;
    }
    if (endsSentence(current) && isIndented(line)) {
      out.push(current);
      current = trimmed;
      continue;
    }
    current = `${current} ${trimmed}`;
  }
  if (current !== "") {
    out.push(current);
  }
  return out.join("\n");
};

/**
 * `text` with each blank-line-separated block unwrapped.
 *
 * Word count is preserved exactly — the property its test asserts, because a
 * joiner that drops or duplicates a token would corrupt every rate downstream
 * while still looking like it worked.
 */
export const unwrap = (text: string): string =>
  text
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map(unwrapBlock)
    .filter((block) => block !== "")
    .join("\n\n");
