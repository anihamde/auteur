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
 * ## These are ids the gateway serves
 *
 * The previous list named none that it did, so every tier resolved to a model
 * that 404s and the first real session died three screens in (decision 0028).
 * The catalogue is generated from the gateway now, and
 * `check-router-catalogue.ts` fails when a candidate here is not in it — which
 * is the check that would have caught it on the day it was written.
 *
 * Every candidate accepts a strict schema, which is not a preference: six of
 * the ten stages are typed, and a list whose leader cannot run them resolves to
 * a model that fails at the first structured call.
 */
export const TIER_CANDIDATES: Readonly<Record<Tier, readonly string[]>> = {
  balanced: ["claude-sonnet-5", "gpt-5.6-terra", "grok-4.6", "kimi-k3"],
  cheap: ["claude-haiku-4-5", "gpt-5.4-nano", "gpt-5-mini", "glm-5p3-flash"],
  strong: ["claude-opus-5", "gpt-6-astra", "claude-fable-5-1", "gpt-5.5"],
};
