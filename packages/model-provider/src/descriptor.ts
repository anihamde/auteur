/**
 * One model, as the rest of this system is allowed to know it.
 *
 * Adapted from nexus's `ModelDescriptor`. What is gone is everything auteur has
 * no surface for — tool support, thinking levels, the reasoning carry-back —
 * and what is added is the three columns `ARCHITECTURE.md` §6.4 asks for. The
 * removals are not simplification for its own sake: a field nothing reads is a
 * field an adapter has to keep correct for no one, and the model panel would
 * render a control for a capability no stage can use.
 *
 * Everything else about a model — wire format, authentication, streaming shape
 * — lives inside the provider adapter and nowhere else.
 */

/**
 * Declared list price, USD micros per million tokens.
 *
 * **Declared, not discovered.** The gateway's models route carries no price, so
 * this table is checked into the repository beside the catalogue and every cost
 * this product shows is labelled an estimate (§10.2). A price that has moved
 * makes the estimate wrong, which is why it is shown as an estimate;
 * presenting it as a bill would be the error.
 */
export type Pricing = {
  readonly inputPerMillion: number;
  readonly outputPerMillion: number;
  readonly cachedInputPerMillion?: number;
};

export type ModelDescriptor = {
  /** The provider's own identifier, and the primary key of the vocabulary. */
  readonly id: string;

  /** The id of the `ModelProvider` that owns this model. */
  readonly providerId: string;

  /** What the model panel renders. */
  readonly displayName: string;

  /**
   * Who made the model — "Anthropic", "OpenAI", "xAI" — as the panel's section
   * heading renders it. A fact about the model rather than about the adapter:
   * one gateway serves models from a dozen labs, so the provider that answers
   * the request and the lab that trained the weights are different facts.
   */
  readonly creator: string;

  /** Total context budget in tokens, input plus output. */
  readonly contextWindow: number;

  /**
   * Ceiling on tokens one call may produce.
   *
   * Not derivable from `contextWindow`, and this is the field that selects the
   * draft strategy (§6.6): a preset whose word target exceeds what one call can
   * emit is drafted scene by scene rather than in one pass. A guess here does
   * not fail loudly — it produces a truncated story that every layer above
   * reports as complete.
   */
  readonly maxOutputTokens: number;

  /**
   * Whether this model accepts `text.format: json_schema` with `strict: true`.
   *
   * Six of the seven model stages are typed, so a tier whose candidates all
   * answer `false` has no eligible model and that is a startup error naming the
   * tier and the stage — not a runtime surprise mid-session, and not a
   * prompt-for-JSON-and-retry path whose failures look like model quality
   * problems.
   *
   * Neither this nor `maxOutputTokens` is in the gateway's model-list shape and
   * neither is uniform across a gateway fronting nine labs, so both are
   * columns in the catalogue constant that `scripts/check-router-catalogue.ts`
   * checks against what the gateway actually reports.
   */
  readonly structuredOutput: boolean;

  readonly pricing: Pricing;

  /**
   * Marks the one model resolution falls back to when nothing else applies. At
   * most one model across the registry may set it; a second is a registration
   * error rather than a silent last-wins.
   */
  readonly default?: boolean;
};

/**
 * Whether `model` can run a stage with the given requirements.
 *
 * One function rather than a rule each of the three resolution layers
 * reimplements (§6.3). A session pin is validated against exactly the check the
 * tier map used, so pinning a model that cannot emit `json_schema` to `outline`
 * is refused with the reason rather than accepted and then failed on.
 */
export type StageRequirements = {
  /** True when the stage declares an `outputSchema`. */
  readonly structuredOutput?: boolean;
  /** The ceiling one call must be able to produce, when the stage needs one. */
  readonly minOutputTokens?: number;
};

export type Eligibility =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reason: string };

export const meetsRequirements = (
  model: ModelDescriptor,
  requirements: StageRequirements,
): Eligibility => {
  if (requirements.structuredOutput === true && !model.structuredOutput) {
    return {
      eligible: false,
      reason: `${model.displayName} does not accept a strict json_schema, and this stage is typed.`,
    };
  }
  if (
    requirements.minOutputTokens !== undefined &&
    model.maxOutputTokens < requirements.minOutputTokens
  ) {
    return {
      eligible: false,
      reason: `${model.displayName} produces at most ${model.maxOutputTokens.toLocaleString("en-US")} tokens in one call, and this stage needs ${requirements.minOutputTokens.toLocaleString("en-US")}.`,
    };
  }
  return { eligible: true };
};
