import type { Tier } from "@auteur/core/pipeline";

/**
 * The tier candidate lists, `docs/IMPLEMENTATION-PLAN.md` §5.2.
 *
 * **Data, and that is the point.** `ARCHITECTURE.md` §6.3 says the
 * stage-to-tier assignment is a hypothesis and a testable one: moving a stage
 * down a tier and reading the style-fit numbers is a cheap experiment, and it is
 * a config edit rather than a code change precisely so that it stays cheap.
 *
 * ## What a tier declares
 *
 * Not a price band. `cheap`, `balanced` and `strong` are price-shaped words for
 * a quality-shaped decision, and taking them literally leads to the wrong
 * question — "is this stage worth paying for?" — instead of the right one:
 *
 * > **A tier declares how much a mistake at this stage costs.**
 *
 * `corpus-select` choosing two odd works is recoverable: the card is built from
 * ten others and the spread is visible in `perWork`. `critique` missing a
 * finding costs one revision pass. `draft` is the product — a bad draft is the
 * session. Cheapness falls out of asking for less capability; it is not the
 * criterion.
 *
 * ## Ordering, and why the strict-schema models lead
 *
 * Resolution takes **the first candidate the catalogue contains that also meets
 * the stage's requirements**. The lists are ordered by expected
 * capability-per-cost, and models believed to accept strict schemas lead the
 * `cheap` and `balanced` lists deliberately: six of the ten stages are typed,
 * so a list ordered any other way resolves to a model that cannot run them and
 * fails at startup.
 *
 * **Provisional until WP-X0.** The catalogue's capability columns are
 * `source: "declared"`, and this list is ordered against them. When the
 * verification pass measures the gateway, a corrected row changes what
 * resolution picks with no edit here.
 */
export const TIER_CANDIDATES: Readonly<Record<Tier, readonly string[]>> = {
  balanced: ["claude-haiku-4.5", "gpt-5", "kimi-k2-0905", "deepseek-v3.2"],
  cheap: ["gpt-5-mini", "qwen3-30b-a3b", "deepseek-v3.2", "glm-4.6-air"],
  strong: ["claude-sonnet-4.5", "gpt-5", "claude-opus-4.1", "grok-4"],
};
