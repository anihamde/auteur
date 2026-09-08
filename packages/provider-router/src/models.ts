import type {
  ModelDescriptor,
  Pricing,
} from "@auteur/model-provider/descriptor";
import { ROUTER_PROVIDER_ID } from "./provider-errors.ts";

/**
 * The model catalogue, as a constant.
 *
 * **A constant rather than a call to the gateway's models route**, for the
 * reason nexus documents at length: that route is the OpenAI model-list shape
 * and carries no context window, no max output, no structured-output support
 * and no price. It can filter this list — `scripts/check-router-catalogue.ts`
 * does exactly that — and it could never build it.
 *
 * ## Every row is `declared`, and that is the point
 *
 * `ARCHITECTURE.md` §6.4 is explicit that `structuredOutput` and
 * `maxOutputTokens` are per-model facts the architecture does not know. They
 * come from published documentation here, not from measurement, and each row
 * says so in `source`. `WP-X0`'s verification pass re-tags a row `measured`
 * only after asking the gateway what it actually does — and **fails if the
 * measured value differs from the declared one**, printing both.
 *
 * `catalogue.test.ts` asserts that **no row is tagged `measured` yet**. That
 * assertion is what stops a declared table from being quietly mistaken for a
 * verified one: it fails the day someone hand-edits a tag, and it is deleted by
 * the same PR that earns the tag.
 *
 * Tier resolution reads this table rather than assuming anything, so a
 * corrected row changes behaviour with no code edit.
 *
 * ## Prices are declared and always will be
 *
 * The gateway's models route carries no price, so this is checked into the
 * repository and every cost the product shows is labelled an estimate (§10.2).
 * A price that has moved makes the estimate wrong, which is why it is presented
 * as an estimate; presenting it as a bill would be the error. `source` never
 * becomes `measured` on the strength of a price.
 *
 * Prices are USD **micros per million tokens**: 1_250_000 is $1.25 per million.
 * Integers rather than floats because they are multiplied by token counts and
 * summed into `stage_runs.cost_micros`, and a float sum of a hundred stages
 * drifts in the last place for no reason anyone can explain to a reader.
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
   * `declared` until WP-X0 has asked the gateway. Never set by hand: the
   * verification pass writes it, and the `no-measured-rows-yet` test fails if
   * anything else does.
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
export const CATALOGUE: readonly CatalogueRow[] = [
  {
    contextWindow: 200_000,
    creator: "Anthropic",
    displayName: "Claude Haiku 4.5",
    id: "claude-haiku-4.5",
    maxOutputTokens: 64_000,
    pricing: {
      cachedInputPerMillion: 100_000,
      inputPerMillion: 1_000_000,
      outputPerMillion: 5_000_000,
    },
    source: "declared",
    structuredOutput: true,
  },
  {
    contextWindow: 200_000,
    creator: "Anthropic",
    displayName: "Claude Sonnet 4.5",
    id: "claude-sonnet-4.5",
    maxOutputTokens: 64_000,
    pricing: {
      cachedInputPerMillion: 300_000,
      inputPerMillion: 3_000_000,
      outputPerMillion: 15_000_000,
    },
    source: "declared",
    structuredOutput: true,
  },
  {
    contextWindow: 200_000,
    creator: "Anthropic",
    displayName: "Claude Opus 4.1",
    id: "claude-opus-4.1",
    maxOutputTokens: 32_000,
    pricing: {
      cachedInputPerMillion: 1_500_000,
      inputPerMillion: 15_000_000,
      outputPerMillion: 75_000_000,
    },
    source: "declared",
    structuredOutput: true,
  },
  {
    contextWindow: 400_000,
    creator: "OpenAI",
    default: true,
    displayName: "GPT-5",
    id: "gpt-5",
    maxOutputTokens: 128_000,
    pricing: {
      cachedInputPerMillion: 125_000,
      inputPerMillion: 1_250_000,
      outputPerMillion: 10_000_000,
    },
    source: "declared",
    structuredOutput: true,
  },
  {
    contextWindow: 400_000,
    creator: "OpenAI",
    displayName: "GPT-5 mini",
    id: "gpt-5-mini",
    maxOutputTokens: 128_000,
    pricing: {
      cachedInputPerMillion: 25_000,
      inputPerMillion: 250_000,
      outputPerMillion: 2_000_000,
    },
    source: "declared",
    structuredOutput: true,
  },
  {
    contextWindow: 256_000,
    creator: "DeepSeek",
    displayName: "DeepSeek V3.2",
    id: "deepseek-v3.2",
    maxOutputTokens: 32_000,
    pricing: { inputPerMillion: 280_000, outputPerMillion: 420_000 },
    source: "declared",
    // Documentation describes a JSON mode rather than a strict schema. The
    // conservative reading costs money; the optimistic one fails a typed stage
    // mid-session.
    structuredOutput: false,
  },
  {
    contextWindow: 262_144,
    creator: "Moonshot",
    displayName: "Kimi K2 (0905)",
    id: "kimi-k2-0905",
    maxOutputTokens: 16_384,
    pricing: { inputPerMillion: 600_000, outputPerMillion: 2_500_000 },
    source: "declared",
    structuredOutput: false,
  },
  {
    contextWindow: 262_144,
    creator: "Alibaba",
    displayName: "Qwen3 30B A3B",
    id: "qwen3-30b-a3b",
    maxOutputTokens: 16_384,
    pricing: { inputPerMillion: 90_000, outputPerMillion: 450_000 },
    source: "declared",
    structuredOutput: false,
  },
  {
    contextWindow: 200_000,
    creator: "Z.ai",
    displayName: "GLM 4.6 Air",
    id: "glm-4.6-air",
    maxOutputTokens: 32_000,
    pricing: { inputPerMillion: 200_000, outputPerMillion: 1_100_000 },
    source: "declared",
    structuredOutput: false,
  },
  {
    contextWindow: 256_000,
    creator: "xAI",
    displayName: "Grok 4",
    id: "grok-4",
    maxOutputTokens: 32_000,
    pricing: { inputPerMillion: 3_000_000, outputPerMillion: 15_000_000 },
    source: "declared",
    structuredOutput: true,
  },
];

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
