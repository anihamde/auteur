import { countWords } from "./tokenize.ts";

export type Block = {
  readonly text: string;
  /** Character offset into the source text. */
  readonly start: number;
  readonly end: number;
  readonly words: number;
};

/**
 * Blank-line-separated blocks, with their offsets into the source.
 *
 * Offsets rather than just text because exemplars cite a character range
 * (`passages.char_start`) and §6.9's regenerate-a-selection addresses one. A
 * block list that lost its positions would make both a search.
 */
export const splitBlocks = (text: string): readonly Block[] => {
  const blocks: Block[] = [];
  const pattern = /\n[ \t]*\n+/g;
  let start = 0;

  const push = (end: number): void => {
    const raw = text.slice(start, end);
    const trimmedStart = start + (raw.length - raw.trimStart().length);
    const body = raw.trim();
    if (body !== "") {
      blocks.push({
        end: trimmedStart + body.length,
        start: trimmedStart,
        text: body,
        words: countWords(body),
      });
    }
  };

  let match = pattern.exec(text);
  while (match !== null) {
    push(match.index);
    start = match.index + match[0].length;
    match = pattern.exec(text);
  }
  push(text.length);
  return blocks;
};
