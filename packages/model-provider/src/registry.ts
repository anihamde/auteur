import { AuteurError } from "@auteur/errors/auteur-error";
import type { ModelDescriptor } from "./descriptor.ts";
import type { ModelProvider } from "./provider.ts";

/**
 * The model registry.
 *
 * Nexus keeps this as a process-wide singleton, and here it is a factory with
 * no module-level instance. The reason is §5.3: there is no long-running
 * process to register into. Every stage is its own function invocation, so a
 * registry built at module scope would be built once per cold start and
 * re-built silently on every other one — which works, and hides the fact that
 * "which providers are configured" is now a per-invocation question rather
 * than a per-process one. A factory makes each caller say when it is asking.
 *
 * Two properties callers depend on:
 *
 * - **Order is registration order, then declaration order.** `listModels`
 *   drives the model panel, and a list whose rows move between renders is a
 *   defect. Nothing is sorted here.
 * - **Registration is all-or-nothing.** Every check runs before anything is
 *   stored, so a rejected provider leaves the registry as it was rather than
 *   half-registered.
 */

export type ResolvedModel = {
  readonly provider: ModelProvider;
  readonly model: ModelDescriptor;
};

export type Registry = {
  readonly registerProvider: (provider: ModelProvider) => void;
  readonly listModels: () => ModelDescriptor[];
  readonly resolve: (modelId: string) => ResolvedModel;
  readonly find: (modelId: string) => ResolvedModel | undefined;
};

type Registration = {
  readonly provider: ModelProvider;
  readonly models: readonly ModelDescriptor[];
};

const isBlank = (value: string): boolean => value.trim().length === 0;

const positiveInteger = (value: number): boolean =>
  Number.isInteger(value) && value > 0;

/**
 * The ways a catalogue row can be unusable.
 *
 * Every one of these is a fact resolution reads and cannot repair. A model with
 * `maxOutputTokens: 0` would be eligible for nothing and would fail the tier
 * that named it at startup, which is the right failure — but with a message
 * about the tier rather than about the row that is wrong. Checking here names
 * the row.
 */
const validatePricing = (model: ModelDescriptor): void => {
  const { pricing } = model;
  if (pricing.inputPerMillion <= 0 || pricing.outputPerMillion <= 0) {
    throw new AuteurError(
      "invalid_input",
      `Model ${model.id} declares a non-positive price. Every cost this product shows is an estimate from declared prices, and a zero would make it silently free.`,
    );
  }
  if (
    pricing.cachedInputPerMillion !== undefined &&
    pricing.cachedInputPerMillion < 0
  ) {
    throw new AuteurError(
      "invalid_input",
      `Model ${model.id} declares a negative cached input price.`,
    );
  }
};

export const createRegistry = (): Registry => {
  const registrations: Registration[] = [];
  const byProviderId = new Map<string, Registration>();
  const byModelId = new Map<string, ResolvedModel>();
  let defaultModelId: string | undefined;

  const validateModels = (
    provider: ModelProvider,
    models: readonly ModelDescriptor[],
  ): string | undefined => {
    const seen = new Set<string>();
    let incomingDefault: string | undefined;

    for (const model of models) {
      if (isBlank(model.id)) {
        throw new AuteurError(
          "invalid_input",
          `Provider ${provider.id} declared a model with a blank id.`,
        );
      }
      if (model.providerId !== provider.id) {
        throw new AuteurError(
          "invalid_input",
          `Model ${model.id} names provider ${model.providerId} but was registered by ${provider.id}.`,
        );
      }
      if (isBlank(model.displayName)) {
        throw new AuteurError(
          "invalid_input",
          `Model ${model.id} has a blank displayName and cannot be rendered.`,
        );
      }
      if (isBlank(model.creator)) {
        throw new AuteurError(
          "invalid_input",
          `Model ${model.id} has a blank creator and cannot be grouped.`,
        );
      }
      if (!positiveInteger(model.contextWindow)) {
        throw new AuteurError(
          "invalid_input",
          `Model ${model.id} declares a contextWindow that is not a positive integer.`,
        );
      }
      if (!positiveInteger(model.maxOutputTokens)) {
        throw new AuteurError(
          "invalid_input",
          `Model ${model.id} declares a maxOutputTokens that is not a positive integer. It selects the draft strategy, so a wrong value produces a truncated story rather than an error.`,
        );
      }
      if (model.maxOutputTokens > model.contextWindow) {
        throw new AuteurError(
          "invalid_input",
          `Model ${model.id} claims it can produce ${model.maxOutputTokens.toString()} tokens out of a ${model.contextWindow.toString()}-token window, which leaves no room for the prompt.`,
        );
      }
      validatePricing(model);

      if (seen.has(model.id) || byModelId.has(model.id)) {
        throw new AuteurError(
          "invalid_input",
          `Model id ${model.id} is already registered; model ids are unique across providers.`,
        );
      }
      seen.add(model.id);

      if (model.default === true) {
        const held = defaultModelId ?? incomingDefault;
        if (held !== undefined) {
          throw new AuteurError(
            "invalid_input",
            `Model ${model.id} claims default: true, but ${held} already does; exactly one model may be the default.`,
          );
        }
        incomingDefault = model.id;
      }
    }

    return incomingDefault;
  };

  const registerProvider = (provider: ModelProvider): void => {
    if (isBlank(provider.id)) {
      throw new AuteurError(
        "invalid_input",
        "A model provider must have a non-blank id.",
      );
    }

    const existing = byProviderId.get(provider.id);
    if (existing !== undefined) {
      // Registering the very same provider again is a no-op: a cold start can
      // run a boot path twice, and re-running one must not be a failure. A
      // *different* implementation claiming the id is the real mistake — it
      // would silently decide which one `resolve` reaches.
      if (existing.provider === provider) return;
      throw new AuteurError(
        "invalid_input",
        `A different provider is already registered as ${provider.id}.`,
      );
    }

    const models: readonly ModelDescriptor[] = [...provider.models()];
    const incomingDefault = validateModels(provider, models);

    const registration: Registration = { models, provider };
    registrations.push(registration);
    byProviderId.set(provider.id, registration);
    for (const model of models) {
      byModelId.set(model.id, { model, provider });
    }
    if (incomingDefault !== undefined) {
      defaultModelId = incomingDefault;
    }
  };

  const listModels = (): ModelDescriptor[] =>
    registrations.flatMap((registration) => [...registration.models]);

  const find = (modelId: string): ResolvedModel | undefined =>
    byModelId.get(modelId);

  /**
   * Throws `model_unavailable` for an unknown id rather than returning
   * undefined.
   *
   * The id reaches here from a `stage_pins` row or a request body, and every
   * caller would otherwise invent the same failure at the point where it can
   * least explain it. `model_unavailable` rather than `invalid_input` because
   * the commonest way to get here is a pin to a model the gateway has since
   * dropped — a 409 the panel can act on, not a 400 about a malformed request.
   */
  const resolve = (modelId: string): ResolvedModel => {
    const found = byModelId.get(modelId);
    if (found === undefined) {
      throw new AuteurError(
        "model_unavailable",
        "No such model is registered.",
        { detail: { modelId } },
      );
    }
    return found;
  };

  return { find, listModels, registerProvider, resolve };
};
