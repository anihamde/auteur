/**
 * `$0.04`, `$0.15`.
 *
 * Always two decimals, and **never with a qualifier baked in**. Every money
 * figure auteur shows is an estimate from a declared price table
 * (`docs/ARCHITECTURE.md` §10.2), and the qualifier — `est.`,
 * `estimated from declared list prices` — belongs to the surface, which knows
 * how much room it has. Putting it here would either repeat it inside a
 * sentence that already said it or truncate it where the rail is narrow.
 *
 * Input is USD micros, matching `stage_runs.cost_micros`, because that is what
 * is stored: computing at write time and summing integers is what stops a later
 * price-table edit from rewriting the history of what a session cost.
 */
export const money = (micros: number): string => {
  const dollars = micros / 1_000_000;
  const sign = dollars < 0 ? "-" : "";
  return `${sign}$${Math.abs(dollars).toFixed(2)}`;
};
