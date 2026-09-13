import type { Beat } from "@auteur/prompt/story";

/**
 * `sequential-scene`: one call per beat, with a running summary between them.
 *
 * Chosen by `strategy.ts` when a single call would exceed the model's output
 * ceiling or the invocation's wall-clock budget. What this module owns is the
 * *shape* of that run — which calls happen in which order, and what each one is
 * given — not the calls themselves, which are `engine.ts`'s.
 */

/**
 * How much of the previous scene's prose is carried forward verbatim.
 *
 * The summary carries facts; the tail carries **voice**. A model handed only a
 * summary starts each scene fresh and the prose drifts between them in a way no
 * measure catches, because each scene is individually in style. Five hundred
 * words is enough to re-establish sentence rhythm and not so much that the
 * prompt grows without bound across twenty beats.
 */
export const CARRY_WORDS = 500;

export const tailWords = (text: string, count = CARRY_WORDS): string => {
  const words = text.trim().split(/\s+/);
  return words.length <= count ? text.trim() : words.slice(-count).join(" ");
};

export type ScenePlan = {
  readonly beat: Beat;
  /** The running summary as of this beat. Absent for the first. */
  readonly continuity?: string;
  /** The previous scene's last words, verbatim. Absent for the first. */
  readonly carried?: string;
  /** Whether a summary call runs after this beat. */
  readonly summarizeAfter: boolean;
  /** Whether a critique runs on this beat's prose. */
  readonly critiqueAfter: boolean;
};

/**
 * The call plan for a set of beats.
 *
 * **No summary call after the last beat.** Nothing reads it, and a model call
 * whose output nothing consumes is a call the reader paid for.
 *
 * **A critique after every beat**, including the last. Under
 * `sequential-scene` the story is long enough that a drift established in beat
 * two and caught only at the end is a revision of the whole thing rather than
 * of one scene — which is the reason this strategy critiques per beat at all
 * rather than once at the end like `single-call`.
 */
export const planScenes = (beats: readonly Beat[]): ScenePlan[] =>
  beats.map((beat, index) => ({
    beat,
    critiqueAfter: true,
    summarizeAfter: index < beats.length - 1,
  }));

export type SceneContext = {
  readonly scenesSoFar: readonly string[];
  readonly summary?: string;
};

/** Fill a plan entry with what the scenes before it produced. */
export const withContext = (
  plan: ScenePlan,
  context: SceneContext,
): ScenePlan => {
  const previous = context.scenesSoFar.at(-1);
  return {
    ...plan,
    ...(previous !== undefined && { carried: tailWords(previous) }),
    ...(context.summary !== undefined && { continuity: context.summary }),
  };
};

/**
 * Join the scenes into the finished draft.
 *
 * A blank line between them, which is the paragraph boundary everything
 * downstream already splits on: `text`'s block splitter, `flush.ts`'s flush
 * boundary and `drift.ts`'s measurement point. Joining with a single newline
 * would make the last sentence of one scene and the first of the next into one
 * paragraph, and every one of those three would then be measuring across a
 * seam that is not in the prose.
 */
export const joinScenes = (scenes: readonly string[]): string =>
  scenes.map((scene) => scene.trim()).join("\n\n");
