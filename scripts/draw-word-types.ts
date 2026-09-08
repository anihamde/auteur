#!/usr/bin/env bun
/**
 * Draw the word types the latinate classifier will be validated against.
 *
 * S3's offline half. The draw is deterministic and reproducible; the
 * **labelling** is a person's, and cannot be faked — a validation set written
 * by whoever wrote the classifier, measured against the classifier, is exactly
 * the failure `ARCHITECTURE.md` §4.3's gate exists to prevent. So this script
 * produces the file a human fills in, and nothing here decides a label.
 *
 * ## Word *types*, not tokens
 *
 * A frequency-weighted sample of tokens is roughly five hundred copies of `the`
 * and `and`, which the classifier declines to classify anyway (it never
 * classifies a word of three letters or fewer). What matters is how it does on
 * the vocabulary, so each distinct form appears once.
 *
 * ## Stratified by frequency, not taken from the top
 *
 * Taking the 500 commonest types measures the classifier on the words it has
 * least to say about; taking a uniform sample of the type list measures it
 * almost entirely on hapax legomena, which are dominated by proper nouns. So
 * the types are ranked by frequency and drawn evenly across that ranking: the
 * sample spans the vocabulary the way the corpus does.
 *
 * The draw is seeded, so re-running on the same corpus produces the same file.
 * A validation set that moved between runs could not be compared with the one
 * that set the threshold.
 */
import { tokenizeLower } from "../packages/text/src/tokenize.ts";

const DEFAULT_SIZE = 500;

/** A tiny deterministic PRNG. `Math.random` cannot be seeded. */
const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export type DrawnType = {
  readonly type: string;
  readonly count: number;
  /** Rank in the frequency list, 1 being the commonest. */
  readonly rank: number;
};

/**
 * Rank every distinct form by frequency.
 *
 * Ties break alphabetically. Without that, two runs over the same corpus order
 * equal-frequency types by insertion and the draw stops being reproducible —
 * the same defect the bigram list has, and the same fix.
 */
export const rankTypes = (text: string): DrawnType[] => {
  const counts = new Map<string, number>();
  for (const token of tokenizeLower(text)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([leftType, leftCount], [rightType, rightCount]) =>
      leftCount === rightCount
        ? leftType.localeCompare(rightType)
        : rightCount - leftCount,
    )
    .map(([type, count], index) => ({ count, rank: index + 1, type }));
};

/**
 * Draw `size` types, spread evenly across the frequency ranking.
 *
 * One from each of `size` equal-width bands, chosen inside its band by the
 * seeded PRNG. A corpus with fewer types than `size` yields all of them.
 */
export const drawTypes = (
  ranked: readonly DrawnType[],
  size = DEFAULT_SIZE,
  seed = 20_260_908,
): DrawnType[] => {
  if (ranked.length <= size) return [...ranked];
  const random = mulberry32(seed);
  const bandWidth = ranked.length / size;
  const drawn: DrawnType[] = [];
  for (let band = 0; band < size; band += 1) {
    const start = Math.floor(band * bandWidth);
    const end = Math.min(Math.floor((band + 1) * bandWidth), ranked.length);
    const index = start + Math.floor(random() * Math.max(end - start, 1));
    const entry = ranked[Math.min(index, ranked.length - 1)];
    if (entry !== undefined) drawn.push(entry);
  }
  return drawn;
};

/**
 * The file a human labels.
 *
 * `latinate` is `null` on every row, and the harness refuses a file that still
 * holds one. A default of `false` would let an unlabelled file score, and it
 * would score well — most words are not Latinate.
 */
export const toLabellingFile = (
  drawn: readonly DrawnType[],
  corpus: string,
): string =>
  `${JSON.stringify(
    {
      "//": [
        "Drawn by scripts/draw-word-types.ts. The labels below are HAND-APPLIED",
        "and are the only part of this file a script may not write.",
        "A suffix list tuned against these labels is a fit to these labels:",
        "report the precision, do not chase it.",
        "`latinate: null` means unlabelled. The harness refuses a file that",
        "still holds one — a default of false would score well on an",
        "unlabelled file, because most words are not Latinate.",
      ],
      corpus,
      drawnAt: new Date().toISOString().slice(0, 10),
      types: drawn.map((entry) => ({
        count: entry.count,
        latinate: null,
        rank: entry.rank,
        type: entry.type,
      })),
    },
    null,
    2,
  )}\n`;

if (import.meta.main) {
  const path = process.argv[2];
  if (path === undefined) {
    process.stderr.write(
      "Usage: bun scripts/draw-word-types.ts <cleaned-corpus.txt> [size]\n\n" +
        "The corpus is a real one, fetched and cleaned. This environment's\n" +
        "egress policy denies gutenberg.org, so the draw is WP-X0's to run.\n",
    );
    process.exit(1);
  }
  const size = Number.parseInt(process.argv[3] ?? "", 10);
  const text = await Bun.file(path).text();
  const drawn = drawTypes(
    rankTypes(text),
    Number.isFinite(size) ? size : DEFAULT_SIZE,
  );
  process.stdout.write(toLabellingFile(drawn, path));
}
