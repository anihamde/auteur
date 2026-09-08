import type { DraftStrategy } from "@auteur/core/pipeline";
import type { LengthPreset } from "@auteur/core/session";
import { WORD_TARGET } from "@auteur/core/session";

/**
 * Which draft strategy a session runs, on **two** ceilings.
 *
 * `PRD.md` §7's rule is that length selects a strategy rather than imposing a
 * cap. `ARCHITECTURE.md` §6.6 makes the first ceiling the model's real
 * `maxOutputTokens`. §5.3 adds the second, and it is the one that is easy to
 * miss: **a function invocation has a wall-clock limit**, and a model that
 * could emit twenty thousand tokens in one call cannot do it inside a
 * sixty-second function.
 *
 * A strategy chosen on the token budget alone therefore collides with the
 * platform: the call is legal, the model is capable, and the invocation is
 * killed part-way through with a truncated story and no error. Checking both is
 * what keeps the two from disagreeing.
 */

/**
 * Tokens per word, English prose.
 *
 * A word is not a token: 1.4 is the ratio that holds across the tokenizers this
 * gateway fronts, and it is deliberately on the high side. Under-estimating
 * produces the failure this module exists to prevent.
 */
export const TOKENS_PER_WORD = 1.4;

/**
 * Headroom on both ceilings.
 *
 * A story that comes in 10% over target is ordinary; a strategy chosen at
 * exactly the ceiling turns that into a truncation.
 */
export const SAFETY = 1.15;

/** Tokens a model emits per second, conservatively. */
export const TOKENS_PER_SECOND = 40;

/**
 * The wall-clock budget for one stage invocation, in seconds.
 *
 * Below the platform's own limit, because the invocation also has to fetch the
 * card, assemble the prompt and write its events.
 */
export const INVOCATION_BUDGET_SECONDS = 240;

export type StrategyInput = {
  readonly lengthPreset: LengthPreset;
  readonly maxOutputTokens: number;
  /** Overridable so a test can assert the duration ceiling independently. */
  readonly tokensPerSecond?: number;
  readonly budgetSeconds?: number;
};

export type StrategyDecision = {
  readonly strategy: DraftStrategy;
  readonly wordTarget: number;
  readonly estimatedTokens: number;
  readonly estimatedSeconds: number;
  /** Which ceiling forced `sequential-scene`, when one did. */
  readonly reason?: "tokens" | "duration";
};

export const estimateTokens = (words: number): number =>
  Math.ceil(words * TOKENS_PER_WORD * SAFETY);

/**
 * Decide the strategy.
 *
 * **The resolved strategy is what the returned value carries**, not the
 * preset's suggestion. A caller that read the preset and inferred the strategy
 * would be a second implementation of this rule, and the two would disagree the
 * first time a model's ceiling moved.
 */
export const resolveStrategy = (input: StrategyInput): StrategyDecision => {
  const wordTarget = WORD_TARGET[input.lengthPreset];
  const estimatedTokens = estimateTokens(wordTarget);
  const estimatedSeconds = Math.ceil(
    estimatedTokens / (input.tokensPerSecond ?? TOKENS_PER_SECOND),
  );
  const budget = input.budgetSeconds ?? INVOCATION_BUDGET_SECONDS;

  if (estimatedTokens > input.maxOutputTokens) {
    return {
      estimatedSeconds,
      estimatedTokens,
      reason: "tokens",
      strategy: "sequential-scene",
      wordTarget,
    };
  }
  if (estimatedSeconds > budget) {
    // The clause that keeps the platform and the strategy from colliding. The
    // model can do it; the invocation cannot.
    return {
      estimatedSeconds,
      estimatedTokens,
      reason: "duration",
      strategy: "sequential-scene",
      wordTarget,
    };
  }
  return {
    estimatedSeconds,
    estimatedTokens,
    strategy: "single-call",
    wordTarget,
  };
};
