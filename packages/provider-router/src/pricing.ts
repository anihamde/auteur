import type { Pricing } from "@auteur/model-provider/descriptor";
import type { Usage } from "@auteur/model-provider/request";

/**
 * What one call cost, in USD micros.
 *
 * **Computed at write time from declared prices, and stored.**
 * `stage_runs.cost_micros` holds the answer rather than the inputs, so a later
 * price-table edit does not rewrite the history of what a session cost
 * (§10.2). A report that changed its numbers when a vendor changed its
 * price list would be a report nobody could reconcile.
 *
 * Integer arithmetic throughout. A float sum over a hundred stages drifts in
 * the last place for no reason anyone can explain to a reader, and the unit is
 * already small enough that rounding to the micro loses nothing: a million
 * tokens at the cheapest row here is 90,000 micros, so one token is 0.09.
 *
 * The cached count is billed at its own rate and is **not** part of
 * `inputTokens` — the decomposition rule in `@auteur/model-provider/request`.
 * A model with no cached rate falls back to the full input rate, which is the
 * conservative direction: it over-reports rather than showing a discount that
 * may not exist.
 */
export const costMicros = (usage: Usage, pricing: Pricing): number => {
  const perMillion = (tokens: number, rate: number): number =>
    Math.round((tokens * rate) / 1_000_000);

  const cached = usage.cachedInputTokens ?? 0;
  const cachedRate = pricing.cachedInputPerMillion ?? pricing.inputPerMillion;

  return (
    perMillion(usage.inputTokens, pricing.inputPerMillion) +
    perMillion(cached, cachedRate) +
    perMillion(usage.outputTokens, pricing.outputPerMillion)
  );
};

/** USD micros as a `$0.00` string. Always two decimals; always an estimate. */
export const formatMicros = (micros: number): string =>
  `$${(micros / 1_000_000).toFixed(2)}`;
