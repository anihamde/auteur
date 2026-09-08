import { splitSentences } from "./sentences.ts";

/**
 * Widen `[from, to)` outward to sentence boundaries.
 *
 * For `docs/ARCHITECTURE.md` §6.9's regenerate-a-selection. Regenerating half a
 * sentence produces a splice that reads as a splice, and the segmenter that
 * decides where a sentence ends is already the one measuring the result — so
 * one function decides both and the two can never disagree.
 *
 * Outward rather than nearest: narrowing would drop text the reader selected,
 * which is a surprise; widening includes a little more than they asked for,
 * which is what they meant.
 */
export const snapToSentence = (
  text: string,
  from: number,
  to: number,
): { readonly from: number; readonly to: number } => {
  const start = Math.max(0, Math.min(from, text.length));
  const end = Math.max(start, Math.min(to, text.length));

  const bounds: number[] = [0];
  let offset = 0;
  for (const sentence of splitSentences(text)) {
    const found = text.indexOf(sentence, offset);
    if (found === -1) {
      continue;
    }
    offset = found + sentence.length;
    bounds.push(offset);
  }
  if (bounds.at(-1) !== text.length) {
    bounds.push(text.length);
  }

  const snappedFrom = bounds.filter((bound) => bound <= start).at(-1) ?? 0;
  const snappedTo = bounds.find((bound) => bound >= end) ?? text.length;
  return { from: snappedFrom, to: snappedTo };
};
