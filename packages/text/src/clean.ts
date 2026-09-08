import { AuteurError } from "@auteur/errors/auteur-error";

/**
 * The start/end marker pairs Project Gutenberg has used.
 *
 * Part of `cleanerVersion`: adding a variant changes what "cleaned" means, and
 * every stored text has to be re-fetched rather than merely re-measured.
 */
export const GUTENBERG_MARKERS: readonly (readonly [string, string])[] = [
  ["*** START OF THE PROJECT GUTENBERG", "*** END OF THE PROJECT GUTENBERG"],
  ["*** START OF THIS PROJECT GUTENBERG", "*** END OF THIS PROJECT GUTENBERG"],
  ["***START OF THE PROJECT GUTENBERG", "***END OF THE PROJECT GUTENBERG"],
  ["*END*THE SMALL PRINT", "End of the Project Gutenberg"],
];

const TRANSCRIBER_NOTE = /^[ \t]*\[?transcriber'?s? note[\s\S]*?\]?[ \t]*$/gim;
const ILLUSTRATION = /^[ \t]*\[illustration[^\]]*\][ \t]*$/gim;

/**
 * A heading: a short line, in title case or capitals, with no terminal
 * punctuation, standing alone in its block.
 *
 * Stripped because a heading is structure rather than prose. Left in, it
 * registers as a very short sentence and a very short paragraph, which pulls
 * both means down for any author whose works have chapters — that is, all of
 * them (`docs/ARCHITECTURE.md` §4.2).
 */
const isHeading = (block: string): boolean => {
  const line = block.trim();
  if (line.includes("\n") || line.length === 0 || line.length > 60) {
    return false;
  }
  if (/[.!?,;:]$/.test(line)) {
    return false;
  }
  return (
    /^(chapter|part|book|canto|section|act|scene)\b/i.test(line) ||
    /^[IVXLC]+\.?$/.test(line) ||
    /^\d+\.?$/.test(line) ||
    line === line.toUpperCase()
  );
};

/**
 * Strip everything outside the Gutenberg markers, plus the apparatus inside.
 *
 * **A file matching no marker variant is a fetch failure, not a text.** One
 * loud error beats a card built from a licence — which is what a lenient
 * fallback produces, and it produces it silently, with plausible-looking
 * numbers.
 */
export const cleanGutenberg = (raw: string, sourceUrl: string): string => {
  const text = raw.replace(/\r\n/g, "\n");

  const found = GUTENBERG_MARKERS.map(([start, end]) => {
    const startAt = text.indexOf(start);
    if (startAt === -1) {
      return undefined;
    }
    const afterStart = text.indexOf("\n", startAt);
    const from = afterStart === -1 ? startAt + start.length : afterStart;
    const endAt = text.indexOf(end, from);
    return { end: endAt === -1 ? text.length : endAt, start: from };
  }).find((match) => match !== undefined);

  if (found === undefined) {
    throw new AuteurError(
      "corpus_unusable",
      "The fetched file carries no Project Gutenberg start marker, so its prose cannot be separated from its licence.",
      { detail: { sourceUrl } },
    );
  }

  return text
    .slice(found.start, found.end)
    .replace(TRANSCRIBER_NOTE, "")
    .replace(ILLUSTRATION, "")
    .split(/\n[ \t]*\n+/)
    .filter((block) => !isHeading(block))
    .join("\n\n")
    .trim();
};
