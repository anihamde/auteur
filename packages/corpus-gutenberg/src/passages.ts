import { newId } from "@auteur/ids/new-id";
import { cutWindows, type Window } from "@auteur/text/cut";
import type { FetchedWork } from "./fetch.ts";

/**
 * Passage selection: deterministic, and no model.
 *
 * Candidate passages are windows of 400 to 900 words cut on paragraph
 * boundaries by `text`'s cut ladder, sampled uniformly across each work's
 * length with **the first and last 5% excluded** — front matter and endings are
 * unrepresentative in opposite directions, and a card built from a book's last
 * pages describes how that author ends things rather than how they write.
 *
 * Around forty candidates go to `style-extract`, which cites the ones it uses.
 * A candidate nothing cites is still stored, because an exemplar the reader
 * excludes and later re-includes must still exist.
 */

export const MIN_WORDS = 400;
export const MAX_WORDS = 900;
export const MARGIN = 0.05;
export const TARGET_CANDIDATES = 40;

export type Candidate = {
  readonly id: string;
  readonly workId: string;
  readonly charStart: number;
  readonly charEnd: number;
  readonly text: string;
};

/**
 * Windows that lie wholly inside the middle 90% of a work.
 *
 * A window that merely *starts* inside the margin is not enough: a window
 * beginning at 94% ends past the boundary, so the excluded ending is in the
 * corpus anyway and the margin has done nothing.
 */
export const insideMargins = (
  windows: readonly Window[],
  length: number,
): Window[] => {
  const low = Math.floor(length * MARGIN);
  const high = Math.ceil(length * (1 - MARGIN));
  return windows.filter((window) => window.start >= low && window.end <= high);
};

/**
 * Take `count` windows spread evenly across a work.
 *
 * Evenly rather than randomly, and this is the whole of "sampled uniformly":
 * an author's prose changes across a novel, and a random draw over a small
 * number of windows clusters. Evenly spaced is reproducible with no seed to
 * carry, which is what makes the same work yield byte-identical passages on two
 * runs — and a card whose passages moved between builds would have a different
 * `buildKey` for the same inputs.
 */
export const spread = <Entry>(
  windows: readonly Entry[],
  count: number,
): Entry[] => {
  if (windows.length <= count) return [...windows];
  const step = windows.length / count;
  return Array.from({ length: count }, (_, index) => {
    const at = Math.min(Math.floor(index * step), windows.length - 1);
    return windows[at] as Entry;
  });
};

/**
 * Candidate passages for a corpus.
 *
 * The per-work budget is the target divided by the number of works, floored at
 * one: twelve works and a target of forty gives three each and a remainder that
 * falls where the works are longest, which is where the prose has most room to
 * vary. A work too short to yield one window contributes none, and that is
 * visible in `perWork` rather than hidden.
 */
export const selectPassages = (
  works: readonly FetchedWork[],
  target = TARGET_CANDIDATES,
): Candidate[] => {
  if (works.length === 0) return [];
  const perWork = Math.max(Math.floor(target / works.length), 1);

  return works.flatMap((work) => {
    const windows = insideMargins(
      cutWindows(work.text, { max: MAX_WORDS, min: MIN_WORDS }),
      work.text.length,
    );
    return spread(windows, perWork).map((window) => ({
      charEnd: window.end,
      charStart: window.start,
      id: newId(),
      text: window.text,
      workId: work.id,
    }));
  });
};
