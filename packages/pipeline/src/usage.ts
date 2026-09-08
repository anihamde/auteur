import type { Pricing } from "@auteur/model-provider/descriptor";
import type { Usage as ProviderUsage } from "@auteur/model-provider/request";

/**
 * Usage accounting, and cost at write time.
 *
 * **The cost is computed when the stage finishes and stored on the row**
 * (`ARCHITECTURE.md` §10.2), not derived from the token counts when a report is
 * read. A later edit to the price table would otherwise rewrite the history of
 * what a session cost, and a report whose numbers change when a vendor changes
 * its price list is a report nobody can reconcile against anything.
 */

export type StageUsage = {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly costMicros: number;
};

/**
 * Normalise a provider's usage.
 *
 * `cachedInputTokens` defaults to zero rather than staying absent: the row has a
 * column, a report sums it, and `undefined + number` is how a total becomes
 * `NaN` three layers from here.
 */
export const normalise = (
  usage: ProviderUsage,
): Omit<StageUsage, "costMicros"> => ({
  cachedInputTokens: usage.cachedInputTokens ?? 0,
  inputTokens: usage.inputTokens,
  outputTokens: usage.outputTokens,
});

/**
 * Cost in USD micros.
 *
 * **Cached input is priced at the cached rate and is not part of
 * `inputTokens`** — the decomposition rule. Folding them together is the error
 * that does not surface until a bill: on a long session most input is cached,
 * so pricing a 90%-cached prompt at the full rate over-reports by several
 * times.
 *
 * A model with no declared cached rate falls back to the full input rate, which
 * over-reports rather than showing a discount that may not exist.
 */
export const costOf = (
  usage: Omit<StageUsage, "costMicros">,
  pricing: Pricing,
): number => {
  const perMillion = (tokens: number, rate: number): number =>
    Math.round((tokens * rate) / 1_000_000);
  return (
    perMillion(usage.inputTokens, pricing.inputPerMillion) +
    perMillion(
      usage.cachedInputTokens,
      pricing.cachedInputPerMillion ?? pricing.inputPerMillion,
    ) +
    perMillion(usage.outputTokens, pricing.outputPerMillion)
  );
};

export const accountFor = (
  usage: ProviderUsage,
  pricing: Pricing,
): StageUsage => {
  const counts = normalise(usage);
  return { ...counts, costMicros: costOf(counts, pricing) };
};

/**
 * What a cancelled stage records.
 *
 * **The tokens already billed are recorded**, because they were. A cancellation
 * that wrote zeros would make a cancelled session look free, and the reader who
 * cancelled it is exactly the one who wants to know what it cost before they
 * did.
 */
export const cancelledUsage = (
  partial: ProviderUsage | undefined,
  pricing: Pricing,
): StageUsage =>
  accountFor(partial ?? { inputTokens: 0, outputTokens: 0 }, pricing);

/** Session cost: the sum of what each stage recorded, not a recomputation. */
export const sessionCost = (stages: readonly StageUsage[]): number =>
  stages.reduce((total, stage) => total + stage.costMicros, 0);
