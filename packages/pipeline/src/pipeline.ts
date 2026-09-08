import type { Pipeline, Stage } from "@auteur/core/pipeline";
import { pipelineSchema } from "@auteur/core/pipeline";
import { AuteurError } from "@auteur/errors/auteur-error";

/**
 * Validating a pipeline definition.
 *
 * A pipeline is data (`@auteur/config`), so nothing stops a definition from
 * naming a stage that does not exist or forming a cycle. These checks run at
 * startup rather than mid-session, for the reason tier resolution does: a
 * pipeline that fails on the sixth stage has already spent five model calls.
 */

export type StageIndex = ReadonlyMap<string, Stage>;

export const indexStages = (pipeline: Pipeline): StageIndex =>
  new Map(pipeline.stages.map((stage) => [stage.id, stage]));

/**
 * Every stage `stage` depends on, transitively.
 *
 * This is what `§7.5`'s input key walks: a stage's key includes the keys of
 * everything it reads, so a change anywhere upstream reaches it without anyone
 * writing the rule down per stage.
 */
export const upstreamOf = (
  index: StageIndex,
  id: string,
  seen = new Set<string>(),
): Set<string> => {
  const stage = index.get(id);
  if (stage === undefined) return seen;
  for (const read of stage.reads) {
    if (seen.has(read)) continue;
    seen.add(read);
    upstreamOf(index, read, seen);
  }
  return seen;
};

/**
 * A cycle in `reads`, if there is one, as the path that closes it.
 *
 * Returned rather than thrown so the caller can name every problem at once: a
 * definition with two mistakes should report two, not one and then another
 * after a fix.
 */
export const findCycle = (pipeline: Pipeline): string[] | undefined => {
  const index = indexStages(pipeline);
  const state = new Map<string, "visiting" | "done">();
  const path: string[] = [];

  const visit = (id: string): string[] | undefined => {
    const seen = state.get(id);
    if (seen === "done") return undefined;
    if (seen === "visiting") return [...path.slice(path.indexOf(id)), id];

    state.set(id, "visiting");
    path.push(id);
    for (const read of index.get(id)?.reads ?? []) {
      const cycle = visit(read);
      if (cycle !== undefined) return cycle;
    }
    path.pop();
    state.set(id, "done");
    return undefined;
  };

  for (const stage of pipeline.stages) {
    const cycle = visit(stage.id);
    if (cycle !== undefined) return cycle;
  }
  return undefined;
};

/**
 * Check a pipeline definition, or throw naming every problem.
 *
 * Three invariants, and each is a shape the engine cannot run:
 *
 * - **`reads` names a stage that exists.** Otherwise the input key walks into
 *   nothing and staleness silently stops propagating from that edge.
 * - **`reads` forms a DAG.** A cycle is a stage waiting for itself.
 * - **`tier` and `promptId` are present together or absent together.** A stage
 *   with a tier and no prompt has a model and nothing to send it; a stage with
 *   a prompt and no tier has something to send and no model to send it to. The
 *   optionality exists for the three deterministic stages, and this is what
 *   keeps it from meaning anything else.
 */
export const validatePipeline = (pipeline: Pipeline): Pipeline => {
  const parsed = pipelineSchema.safeParse(pipeline);
  if (!parsed.success) {
    throw new AuteurError(
      "invalid_input",
      "The pipeline definition is not a valid pipeline.",
      { detail: { issues: parsed.error.issues } },
    );
  }

  const problems: string[] = [];
  const ids = new Set(pipeline.stages.map((stage) => stage.id));
  if (ids.size !== pipeline.stages.length) {
    problems.push("two stages share an id");
  }

  for (const stage of pipeline.stages) {
    for (const read of stage.reads) {
      if (!ids.has(read)) {
        problems.push(`${stage.id} reads ${read}, which is not a stage`);
      }
    }
    const hasTier = stage.tier !== undefined;
    const hasPrompt = stage.promptId !== undefined;
    if (hasTier !== hasPrompt) {
      problems.push(
        hasTier
          ? `${stage.id} has a tier and no prompt: a model with nothing to send it`
          : `${stage.id} has a prompt and no tier: something to send and no model to send it to`,
      );
    }
    if (stage.typed && !hasPrompt) {
      problems.push(
        `${stage.id} is typed but runs no model, so there is no output to parse`,
      );
    }
  }

  const cycle = findCycle(pipeline);
  if (cycle !== undefined) {
    problems.push(`reads forms a cycle: ${cycle.join(" → ")}`);
  }

  if (problems.length > 0) {
    throw new AuteurError(
      "invalid_input",
      `The pipeline definition is not runnable: ${problems.join("; ")}.`,
      { detail: { problems } },
    );
  }
  return pipeline;
};
