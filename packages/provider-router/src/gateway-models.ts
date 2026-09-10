import { z } from "zod";
import type { CatalogueRow } from "./models.ts";

/**
 * The gateway's model list, as a schema rather than a cast.
 *
 * `models.ts` said this route "is the OpenAI model-list shape and carries no
 * context window, no max output, no structured-output support and no price. It
 * can filter this list … and it could never build it." That was written from
 * the OpenAI specification, and it is false for this gateway: every entry
 * carries a `router` block with limits, capabilities and prices.
 *
 * The consequence is decision 0028's whole point — the catalogue is generated
 * from what the gateway says rather than typed from what documentation claims,
 * and every capability column is therefore `measured`.
 *
 * **It describes the fields this code reads and nothing else.** Unknown keys
 * are stripped, not rejected: the same rule decision 0022 arrived at after a
 * field the product did not read took the product down. The `router` block
 * carries a dozen more things — modalities, reasoning efforts, verbosity — and
 * describing them would only create more ways for a refresh to fail.
 */

const priceSchema = z.string().min(1);

const gatewayModelSchema = z.object({
  display_name: z.string().min(1),
  id: z.string().min(1),
  owned_by: z.string().min(1),
  router: z.object({
    capabilities: z.object({ structured_outputs: z.boolean() }),
    limits: z.object({
      context_window: z.number().int().positive(),
      max_output_tokens: z.number().int().positive(),
    }),
    pricing: z.object({ input: priceSchema, output: priceSchema }),
    /** `deprecated` is a model the gateway still answers for and will not for ever. */
    status: z.string().min(1),
  }),
});

export type GatewayModel = z.infer<typeof gatewayModelSchema>;

export const gatewayModelsSchema = z.object({
  data: z.array(gatewayModelSchema),
});

/**
 * Parse the response, or throw naming what moved.
 *
 * `z.prettifyError` rather than the raw issue list: this is read by whoever
 * runs the refresh, and "expected number, received undefined at
 * data[0].router.limits.context_window" is the sentence that says which field
 * the gateway changed.
 */
export const parseGatewayModels = (payload: unknown): GatewayModel[] => {
  const result = gatewayModelsSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(
      `The gateway's model list is not the shape this schema accepts.\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data.data;
};

/** How many micros in one dollar-per-million. */
const MICROS = 1_000_000;
const MICRO_DIGITS = 6;

/**
 * A decimal price string as integer micros.
 *
 * The gateway sends `"1.4"` and `"0.15"`, meaning dollars per million tokens.
 * Parsing those with `Number` and multiplying reintroduces exactly the drift
 * `pricing.ts` uses integers to avoid — `0.15 * 1e6` is fine, `1.1 * 1e6` is
 * `1100000.0000000002`, and a hundred stages of that is a cost nobody can
 * explain. So the string is split and padded instead: no float ever exists.
 */
export const microsFrom = (price: string): number => {
  const [whole = "0", fraction = ""] = price.split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction)) {
    throw new Error(`"${price}" is not a decimal price.`);
  }
  if (fraction.length > MICRO_DIGITS) {
    throw new Error(
      `"${price}" is finer than a micro, which this cannot represent without rounding.`,
    );
  }
  return (
    Number(whole) * MICROS + Number(fraction.padEnd(MICRO_DIGITS, "0") || "0")
  );
};

/**
 * The creator, as the model panel shows it.
 *
 * `owned_by` is the gateway's routing answer — `fireworks` and `baseten` are
 * who serves the weights, not who made them — so it is presented capitalised
 * and otherwise unedited. Mapping `fireworks` to a guess at the lab behind each
 * model would be this file inventing a fact it was not told.
 */
const creatorFrom = (ownedBy: string): string =>
  ownedBy.charAt(0).toUpperCase() + ownedBy.slice(1);

/** The id resolution falls back to when nothing else applies. */
export const DEFAULT_MODEL_ID = "claude-opus-5";

/**
 * The gateway's answer as catalogue rows.
 *
 * **Deprecated models are dropped.** The gateway still answers for them, and a
 * row here is a model a session can be pinned to — so keeping one is a pin
 * waiting to fail mid-run on a schedule nobody here controls.
 *
 * Ordered by creator then id, which is the order the model panel renders and
 * therefore an ordering nothing may sort at run time.
 */
export const toCatalogueRows = (
  models: readonly GatewayModel[],
): CatalogueRow[] =>
  models
    .filter((model) => model.router.status !== "deprecated")
    .map((model) => ({
      contextWindow: model.router.limits.context_window,
      creator: creatorFrom(model.owned_by),
      ...(model.id === DEFAULT_MODEL_ID && { default: true as const }),
      displayName: model.display_name,
      id: model.id,
      // The gateway reports a max output equal to the whole window for several
      // models. That is what it says, and the registry only refuses the
      // reverse, so it is passed through rather than second-guessed here.
      maxOutputTokens: Math.min(
        model.router.limits.max_output_tokens,
        model.router.limits.context_window,
      ),
      pricing: {
        inputPerMillion: microsFrom(model.router.pricing.input),
        outputPerMillion: microsFrom(model.router.pricing.output),
      },
      source: "measured" as const,
      structuredOutput: model.router.capabilities.structured_outputs,
    }))
    .sort((left, right) =>
      left.creator === right.creator
        ? left.id.localeCompare(right.id)
        : left.creator.localeCompare(right.creator),
    );
