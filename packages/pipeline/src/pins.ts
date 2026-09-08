import type { Stage } from "@auteur/core/pipeline";
import { AuteurError } from "@auteur/errors/auteur-error";
import type { ModelDescriptor } from "@auteur/model-provider/descriptor";
import { meetsRequirements } from "@auteur/model-provider/descriptor";
import { requirementsFor } from "./resolve-tier.ts";

/**
 * Session pins — layer 3 of `ARCHITECTURE.md` §6.3.
 *
 * A pin overrides the tier map for one stage in one session, and it is
 * **validated against exactly the check the tier map used**. `requirementsFor`
 * is imported rather than reimplemented, which is the whole reason it is a
 * function: a second copy of the rule would let a pin be accepted for a stage
 * the tier map would have refused, and the failure would arrive mid-session
 * with a schema violation rather than at the panel with a reason.
 *
 * The layering is deliberately identical to the card overlay's — canonical
 * defaults, per-session overrides, per-field reset, and the UI marks what is
 * overridden. One mechanism, learned once.
 */

export type Pin = { readonly stageId: string; readonly modelId: string };

export type PinVerdict =
  | { readonly accepted: true; readonly model: ModelDescriptor }
  | { readonly accepted: false; readonly reason: string };

export type ValidateInput = {
  readonly pin: Pin;
  readonly stages: readonly Stage[];
  readonly catalogue: readonly ModelDescriptor[];
  readonly minOutputTokens?: number;
};

/**
 * Whether a pin may be written.
 *
 * A verdict rather than a throw: the panel writes seven pins at once for "use
 * one model for every stage", and it has to be able to say which six were
 * accepted and why the seventh was not.
 */
export const validatePin = (input: ValidateInput): PinVerdict => {
  const stage = input.stages.find(
    (candidate) => candidate.id === input.pin.stageId,
  );
  if (stage === undefined) {
    return {
      accepted: false,
      reason: `${input.pin.stageId} is not a stage in this pipeline.`,
    };
  }
  if (stage.tier === undefined) {
    return {
      accepted: false,
      reason: `${stage.id} runs no model, so there is nothing to pin.`,
    };
  }
  const model = input.catalogue.find(
    (candidate) => candidate.id === input.pin.modelId,
  );
  if (model === undefined) {
    return {
      accepted: false,
      reason: `The catalogue does not carry ${input.pin.modelId}.`,
    };
  }

  const verdict = meetsRequirements(
    model,
    requirementsFor(stage, input.minOutputTokens),
  );
  return verdict.eligible
    ? { accepted: true, model }
    : { accepted: false, reason: verdict.reason };
};

/**
 * Apply "use one model for every stage".
 *
 * The control the design does not have (§6.3), and the commoner case: someone
 * with one model they trust who wants the whole pipeline on it. It is seven
 * writes to `stage_pins` and no new mechanism, and a model that cannot emit a
 * strict schema is **refused for the typed stages with the reason** rather than
 * silently applied to `draft` alone.
 */
export type PinAllResult = {
  readonly accepted: readonly Pin[];
  readonly refused: readonly {
    readonly stageId: string;
    readonly reason: string;
  }[];
};

export const pinAll = (
  modelId: string,
  stages: readonly Stage[],
  catalogue: readonly ModelDescriptor[],
): PinAllResult => {
  const accepted: Pin[] = [];
  const refused: { stageId: string; reason: string }[] = [];

  for (const stage of stages) {
    if (stage.tier === undefined) continue;
    const pin = { modelId, stageId: stage.id };
    const verdict = validatePin({ catalogue, pin, stages });
    if (verdict.accepted) accepted.push(pin);
    else refused.push({ reason: verdict.reason, stageId: stage.id });
  }
  return { accepted, refused };
};

/** Throw for a caller that wants the pin or nothing. */
export const requirePin = (input: ValidateInput): ModelDescriptor => {
  const verdict = validatePin(input);
  if (!verdict.accepted) {
    throw new AuteurError("invalid_input", verdict.reason, {
      detail: { modelId: input.pin.modelId, stageId: input.pin.stageId },
    });
  }
  return verdict.model;
};
