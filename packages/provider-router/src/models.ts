import type {
  ModelDescriptor,
  Pricing,
} from "@auteur/model-provider/descriptor";
import { GENERATED_CATALOGUE } from "./generated/catalogue.ts";
import { ROUTER_PROVIDER_ID } from "./provider-errors.ts";

/**
 * The model catalogue.
 *
 * **Generated from the gateway, not typed from documentation.** This file used
 * to hold the rows, every one tagged `declared`, written from published
 * documentation because the models route "carries no context window, no max
 * output, no structured-output support and no price … it could never build
 * it". That was true of the OpenAI specification and false of this gateway,
 * whose every entry carries limits, capabilities and prices.
 *
 * The cost of the mistake was total: not one id in the hand-written table was
 * one the gateway serves, so the first real model call — three screens into the
 * first real session — answered 404, and every tier resolved to something that
 * did not exist. Decision 0028 has the whole of it.
 *
 * So `bun run catalogue:models` asks and writes `generated/catalogue.ts`, the
 * file is committed, and `source` is `measured` because it was measured.
 * `scripts/check-router-catalogue.ts` fails when the two drift.
 *
 * ## Prices are the gateway's own, and still estimates
 *
 * The gateway reports dollars per million as decimal strings and the generator
 * converts them to integer micros without ever constructing a float — `1.1 *
 * 1e6` is `1100000.0000000002`, and a hundred stages of that is a cost nobody
 * can explain to a reader. What the product shows is still labelled an estimate
 * (§10.2): a price can move between refreshes, which is exactly why it is
 * presented as an estimate and not as a bill.
 *
 * Prices are USD **micros per million tokens**: 1_250_000 is $1.25 per million.
 */

export { ROUTER_PROVIDER_ID };

/** Where a row's capability columns came from. */
export type CatalogueSource = "declared" | "measured";

export type CatalogueRow = {
  readonly id: string;
  readonly displayName: string;
  readonly creator: string;
  readonly contextWindow: number;
  readonly maxOutputTokens: number;
  readonly structuredOutput: boolean;
  readonly pricing: Pricing;
  /**
   * Where the capability columns came from. `measured` on every generated row,
   * because the gateway is what produced them. Never written by hand — the
   * generator writes this file, and hand-editing it is what the header line
   * exists to forbid.
   */
  readonly source: CatalogueSource;
  readonly default?: boolean;
};

/**
 * The catalogue.
 *
 * Ordered by creator then capability, which is the order the model panel
 * renders and therefore an ordering nothing may sort at run time.
 *
 * The `structuredOutput` column carries the **conservative assumption** where
 * documentation is thin (§4/S1): a `false` that turns out to be a `true` costs
 * money, and a `true` that turns out to be a `false` fails a typed stage
 * mid-session. Six of the seven model stages are typed.
 */
/**
 * The catalogue, as the gateway last answered.
 *
 * Ordered by creator then id, which is the order the model panel renders and
 * therefore an ordering nothing may sort at run time.
 */
export const CATALOGUE: readonly CatalogueRow[] = GENERATED_CATALOGUE;

/** A catalogue row as the registry takes it. */
export const toDescriptor = (row: CatalogueRow): ModelDescriptor => ({
  contextWindow: row.contextWindow,
  creator: row.creator,
  ...(row.default === true && { default: true as const }),
  displayName: row.displayName,
  id: row.id,
  maxOutputTokens: row.maxOutputTokens,
  pricing: row.pricing,
  providerId: ROUTER_PROVIDER_ID,
  structuredOutput: row.structuredOutput,
});

export const findRow = (id: string): CatalogueRow | undefined =>
  CATALOGUE.find((row) => row.id === id);
