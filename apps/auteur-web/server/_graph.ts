import { DEFAULT_PIPELINE, STAGE_IDS } from "@auteur/config/stages";
import type { Step } from "@auteur/core/session";

/**
 * The pipeline as a graph, and the two bounds anything asks it for.
 *
 * Here rather than in a route or in `_internal`, because both need it and the
 * one that had it — `run-stage.ts` — already imports from `advance.ts` for the
 * staleness input. A second edge back the other way would be a cycle between a
 * route and the thing routes invoke, and the graph belongs to neither.
 *
 * `reads` is the only source. Nothing below lists a successor or a descendant,
 * so a stage added to `DEFAULT_PIPELINE` is reachable by both without an edit.
 */

/**
 * The last stage each wizard step needs finished.
 *
 * §3.2's seven steps and §6.2's nine stages are different lists on purpose: a
 * step is a screen and a stage is a unit of work. `idea` and `author` need no
 * stage — reaching them runs nothing, which is why they map to `undefined`
 * rather than to the first stage.
 */
export const LAST_STAGE_FOR_STEP: Readonly<Record<Step, string | undefined>> = {
  author: undefined,
  clarify: "clarify",
  idea: undefined,
  outline: "outline",
  research: "style-extract",
  result: "style-fit",
  story: "story",
};

/** The stages the pipeline would run immediately after this one, in graph order. */
export const successorsOf = (stageId: string): string[] =>
  DEFAULT_PIPELINE.stages
    .filter((stage) => stage.reads.includes(stageId))
    .map((stage) => stage.id);

/**
 * Every stage downstream of this one, however far, in graph order.
 *
 * Transitive, because "replace this output" means replacing everything built
 * on it and `draft` is two stages above `style-fit`. Computed by walking
 * `reads` rather than by a second list that would have to agree with the first.
 */
export const descendantsOf = (stageId: string): string[] => {
  const found = new Set<string>();
  const pending = [stageId];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    for (const next of successorsOf(current)) {
      if (found.has(next)) continue;
      found.add(next);
      pending.push(next);
    }
  }
  return STAGE_IDS.filter((id) => found.has(id));
};

/**
 * The successors the session has actually asked for, in graph order.
 *
 * §7.1 says `advance` is the only route that *starts* work, and on the
 * serverless path that was true by accident: a finished stage enqueued its
 * successors, one invocation was asked for, and the rest sat in the queue until
 * the reader pressed a button. The worker drains the queue, so the accident
 * ended — `clarify` wrote its questions and `outline` started in the same
 * second, read an empty answer set, and built the beat sheet from the idea
 * alone. The reader's answers were never read by anything.
 *
 * So the bound is stated rather than inherited, and it is the same bound
 * `enqueueStaleUpTo` uses: nothing past the last stage the current step needs.
 * A step that needs no stage (`idea`, `author`) enqueues nothing at all.
 */
export const successorsWithin = (stageId: string, step: Step): string[] => {
  const limit = LAST_STAGE_FOR_STEP[step];
  if (limit === undefined) return [];
  const bound = STAGE_IDS.indexOf(limit);
  return successorsOf(stageId).filter((id) => {
    const at = STAGE_IDS.indexOf(id);
    return at !== -1 && at <= bound;
  });
};
