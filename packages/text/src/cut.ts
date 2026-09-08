import { type Block, splitBlocks } from "./blocks.ts";
import { splitSentences } from "./sentences.ts";
import { countWords } from "./tokenize.ts";

export type Window = {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly words: number;
};

/**
 * The cut ladder, from nexus's `chunking` with its heading tier dropped —
 * unreachable on plain prose, per `docs/ARCHITECTURE.md` §2.
 *
 * Cut on a block boundary where one is available; fall back to a sentence
 * boundary; fall back to a character boundary that never tears a surrogate
 * pair. The last rung matters more than it looks: the corpus is translations,
 * and a cut through a surrogate pair produces a lone half that every downstream
 * regex then behaves oddly around.
 */
const isLowSurrogate = (code: number): boolean =>
  code >= 0xdc00 && code <= 0xdfff;

/** The nearest offset at or before `index` that does not split a code point. */
export const safeBoundary = (text: string, index: number): number => {
  if (index <= 0) {
    return 0;
  }
  if (index >= text.length) {
    return text.length;
  }
  return isLowSurrogate(text.charCodeAt(index)) ? index - 1 : index;
};

/**
 * Windows of `min` to `max` words, cut on block boundaries.
 *
 * A block longer than `max` on its own is cut at sentence boundaries rather
 * than dropped: a single very long paragraph is a real thing in this corpus and
 * discarding it would bias the sample toward authors who paragraph often.
 */
export const cutWindows = (
  text: string,
  options: { readonly min: number; readonly max: number },
): readonly Window[] => {
  const windows: Window[] = [];
  let current: Block[] = [];
  let words = 0;

  const flush = (): void => {
    if (current.length === 0 || words < options.min) {
      return;
    }
    const first = current[0];
    const last = current.at(-1);
    if (first === undefined || last === undefined) {
      return;
    }
    windows.push({
      end: last.end,
      start: first.start,
      text: text.slice(first.start, last.end),
      words,
    });
    current = [];
    words = 0;
  };

  for (const block of splitBlocks(text)) {
    if (block.words > options.max) {
      flush();
      windows.push(...cutLongBlock(text, block, options));
      continue;
    }
    if (words + block.words > options.max) {
      flush();
    }
    current.push(block);
    words += block.words;
    if (words >= options.min) {
      flush();
    }
  }
  flush();
  return windows;
};

const cutLongBlock = (
  source: string,
  block: Block,
  options: { readonly min: number; readonly max: number },
): readonly Window[] => {
  const windows: Window[] = [];
  let offset = block.start;
  let buffer: string[] = [];
  let words = 0;

  for (const sentence of splitSentences(block.text)) {
    buffer.push(sentence);
    words += countWords(sentence);
    if (words >= options.min) {
      const body = buffer.join(" ");
      const start = safeBoundary(source, offset);
      const end = safeBoundary(source, offset + body.length);
      windows.push({ end, start, text: source.slice(start, end), words });
      offset = end + 1;
      buffer = [];
      words = 0;
    }
  }
  return windows;
};
