import type { Stage, Tier } from "@auteur/core/pipeline";
import { AuteurError } from "@auteur/errors/auteur-error";
import type {
  ModelDescriptor,
  StageRequirements,
} from "@auteur/model-provider/descriptor";
import { meetsRequirements } from "@auteur/model-provider/descriptor";

/**
 * Tier resolution, layers 1 and 2 of `ARCHITECTURE.md` §6.3.
 *
 * 1. **The catalogue** — `provider-router`'s `models()`, snapshotted at
 *    registration.
 * 2. **The tier map** — `@auteur/config`'s ordered candidate list per tier.
 *
 * Resolution takes the first candidate the catalogue contains **and** that meets
 * the stage's requirements. Layer 3, the session pins, is `pins.ts`.
 *
 * **A tier with no eligible candidate is a startup error, not a runtime
 * surprise.** §6.4 is explicit that the answer is not a prompt-for-JSON repair
 * loop: that is a second code path whose failures look like model quality
 * problems. So this fails loudly, naming the tier, the stage and every
 * candidate's reason — and a session that would have failed on its sixth stage
 * fails before its first.
 */

/**
 * What a stage needs of a model.
 *
 * A typed stage needs strict structured output. `draft` under `single-call`
 * needs enough output tokens for the whole story, which is why the caller can
 * pass one: the requirement is a property of the *resolved strategy*, not of
 * the stage definition, and `strategy.ts` is what decides it.
 */
export const requirementsFor = (
  stage: Stage,
  minOutputTokens?: number,
): StageRequirements => ({
  ...(minOutputTokens !== undefined && { minOutputTokens }),
  ...(stage.typed && { structuredOutput: true }),
});

export type Resolution = {
  readonly model: ModelDescriptor;
  readonly tier: Tier;
  /** Candidates skipped before this one, with why. Rendered in the panel. */
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
};

export type ResolveInput = {
  readonly stage: Stage;
  readonly tier: Tier;
  readonly candidates: readonly string[];
  readonly catalogue: readonly ModelDescriptor[];
  readonly minOutputTokens?: number;
};

export const resolveTier = (input: ResolveInput): Resolution => {
  const requirements = requirementsFor(input.stage, input.minOutputTokens);
  const byId = new Map(input.catalogue.map((model) => [model.id, model]));
  const skipped: { id: string; reason: string }[] = [];

  for (const id of input.candidates) {
    const model = byId.get(id);
    if (model === undefined) {
      // Not an error on its own: a gateway drops a model and the next
      // candidate takes over, which is what an ordered list is for.
      skipped.push({ id, reason: "the catalogue does not carry it" });
      continue;
    }
    const verdict = meetsRequirements(model, requirements);
    if (!verdict.eligible) {
      skipped.push({ id, reason: verdict.reason });
      continue;
    }
    return { model, skipped, tier: input.tier };
  }

  throw new AuteurError(
    "model_unavailable",
    `No model in the ${input.tier} tier can run ${input.stage.id}.`,
    {
      detail: {
        candidates: skipped,
        stage: input.stage.id,
        tier: input.tier,
      },
    },
  );
};

/**
 * Resolve every model stage, or fail naming all of them.
 *
 * Called at startup. One stage at a time would report the first failure and
 * hide the rest, so a contributor fixing a tier list would learn about the
 * second problem only after deploying the fix for the first.
 */
export const resolveAll = (
  stages: readonly Stage[],
  candidates: Readonly<Record<Tier, readonly string[]>>,
  catalogue: readonly ModelDescriptor[],
): Map<string, Resolution> => {
  const resolved = new Map<string, Resolution>();
  const failures: string[] = [];

  for (const stage of stages) {
    if (stage.tier === undefined) continue;
    try {
      resolved.set(
        stage.id,
        resolveTier({
          candidates: candidates[stage.tier],
          catalogue,
          stage,
          tier: stage.tier,
        }),
      );
    } catch (thrown) {
      failures.push(
        thrown instanceof Error
          ? thrown.message
          : `${stage.id} did not resolve`,
      );
    }
  }

  if (failures.length > 0) {
    throw new AuteurError(
      "model_unavailable",
      `The pipeline cannot start: ${failures.join(" ")}`,
      { detail: { failures } },
    );
  }
  return resolved;
};
