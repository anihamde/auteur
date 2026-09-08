import { splitBlocks } from "@auteur/text/blocks";
import { splitSentences } from "@auteur/text/sentences";
import { countWords } from "@auteur/text/tokenize";

export type Distribution = {
  readonly mean: number;
  readonly median: number;
  readonly p10: number;
  readonly p90: number;
  readonly stdev: number;
};

const EMPTY: Distribution = { mean: 0, median: 0, p10: 0, p90: 0, stdev: 0 };

/**
 * A percentile by linear interpolation between order statistics.
 *
 * Interpolated rather than nearest-rank because these numbers are compared
 * across corpora of very different sizes — a twelve-work corpus against a
 * thousand-word draft — and nearest-rank makes a small sample's p90 jump in
 * visible steps as one sentence is added. The band a verdict is scored against
 * would then move for a reason that is about sample size rather than prose.
 */
export const percentile = (
  sorted: readonly number[],
  fraction: number,
): number => {
  if (sorted.length === 0) {
    return 0;
  }
  if (sorted.length === 1) {
    return sorted[0] ?? 0;
  }
  const position = fraction * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] ?? 0;
  const high = sorted[upper] ?? low;
  return low + (high - low) * (position - lower);
};

export const distribution = (values: readonly number[]): Distribution => {
  if (values.length === 0) {
    return EMPTY;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return {
    mean,
    median: percentile(sorted, 0.5),
    p10: percentile(sorted, 0.1),
    p90: percentile(sorted, 0.9),
    stdev: Math.sqrt(variance),
  };
};

/** Word counts, one per sentence. */
export const sentenceLengths = (text: string): readonly number[] =>
  splitSentences(text)
    .map(countWords)
    .filter((count) => count > 0);

/** Word counts, one per paragraph. */
export const paragraphLengths = (text: string): readonly number[] =>
  splitBlocks(text)
    .map((block) => block.words)
    .filter((count) => count > 0);
