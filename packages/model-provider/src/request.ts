/**
 * One stage's worth of input to a model, and what comes back.
 *
 * auteur's request is smaller than nexus's in the way auteur is smaller: there
 * is no conversation and there are no tools. A stage assembles a system prompt
 * and one user message from its inputs, sends it, and parses the result. The
 * pipeline is deterministic stages, not a tool loop.
 */

/** A JSON Schema document, as the gateway takes it. Not inspected here. */
export type JsonSchema = Readonly<Record<string, unknown>>;

/**
 * The typed-output request.
 *
 * `strict` is the literal `true` rather than `boolean` on purpose: a
 * non-strict schema is a suggestion the model may ignore, and a caller that
 * could pass `false` would be able to turn every stage's output contract off
 * one call site at a time. Invariant 4 says a model's output is parsed, never
 * trusted; asking for strict is how the parse is usually cheap.
 */
export type ResponseFormat = {
  readonly name: string;
  readonly schema: JsonSchema;
  readonly strict: true;
};

export type ModelRequest = {
  /** The model to run. Always one of the ids the provider declared. */
  readonly modelId: string;

  /** The assembled system prompt. */
  readonly system: string;

  /** The stage's input, already rendered. */
  readonly input: string;

  /** Ceiling on the tokens this call may produce. */
  readonly maxTokens: number;

  /** Present when the stage has an `outputSchema`. */
  readonly format?: ResponseFormat;
};

/**
 * Why the model stopped producing tokens.
 *
 * Smaller than nexus's set, and every removal is a state auteur cannot reach:
 * there are no tools, so no `tool_use` and no `pause`; there are no stop
 * sequences, so no `stop_sequence`. What is left is what a stage branches on.
 *
 * `max_tokens` is the one that matters and the one a caller must not treat as
 * success: a truncated draft that every layer above reports as complete is
 * worse than an error, because nothing is red and the reader takes a
 * half-story for a whole one. §6.6's draft strategy exists to avoid reaching
 * it, and the stage still checks.
 */
export type StopReason = "end_turn" | "max_tokens" | "refusal";

/**
 * Token accounting for one call.
 *
 * The cached count is separate rather than folded into `inputTokens` because
 * it is billed at a fraction of the rate, so a caller that adds them together
 * loses the only information that made them worth reporting.
 *
 * **The decomposition rule.** The counts partition the call's input; none
 * contains another:
 *
 * ```
 * total input = inputTokens + cachedInputTokens
 * ```
 *
 * This is the part a wire format will not tell you. A gateway that reports a
 * total with the cached count as a subset of it must have the subset taken out
 * before it is reported here — copying the total into `inputTokens` counts the
 * cached tokens twice, at the wrong rate, and nothing catches it until a bill.
 */
export type Usage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens?: number;
};
