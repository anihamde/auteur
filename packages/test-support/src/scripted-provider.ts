import { AuteurError } from "@auteur/errors/auteur-error";
import type {
  ModelDescriptor,
  Pricing,
} from "@auteur/model-provider/descriptor";
import type {
  ModelProvider,
  ProviderEvent,
} from "@auteur/model-provider/provider";
import type {
  ModelRequest,
  StopReason,
  Usage,
} from "@auteur/model-provider/request";

/**
 * A provider that replays a script, so the pipeline can be tested without a
 * gateway.
 *
 * Every stage in `@auteur/pipeline` is tested against this rather than against
 * a recorded transcript, and the two are not interchangeable. A recording
 * proves the *adapter* reads a wire format correctly, which is
 * `@auteur/provider-router`'s own suite. This proves the *pipeline* behaves
 * when a model does something — truncates, refuses, fails mid-stream, is
 * cancelled — and those are states a recording of a successful call cannot
 * reach.
 *
 * The script is a list of turns, taken in order. A stage that runs twice (the
 * `clarify` loop, a retried queue row) takes the next turn, which is how a test
 * says "the second attempt succeeds" without a mock's call-count matching.
 */

export type ScriptedTurn = {
  /** Text chunks, yielded in order. A stage that parses sees them joined. */
  readonly deltas?: readonly string[];
  /** How the turn ends. Defaults to `end_turn`. */
  readonly stop?: StopReason;
  readonly usage?: Partial<Usage>;
  /**
   * Fail after the deltas, instead of stopping.
   *
   * A terminal `error` rather than a throw, matching the contract: the deltas
   * already yielded are real, and the failure is part of the same sequence.
   */
  readonly error?: AuteurError;
  /** Milliseconds to wait between deltas, so a test can cancel mid-stream. */
  readonly delayMs?: number;
};

export type ScriptedProvider = ModelProvider & {
  /** Every request the pipeline made, in order. */
  readonly requests: readonly ModelRequest[];
  /** Turns not yet taken. A test asserts this is empty at the end. */
  readonly remaining: () => number;
};

const DEFAULT_PRICING: Pricing = {
  cachedInputPerMillion: 100_000,
  inputPerMillion: 1_000_000,
  outputPerMillion: 5_000_000,
};

export const SCRIPTED_PROVIDER_ID = "scripted";

/**
 * Descriptors the scripted provider offers.
 *
 * Two of them, differing in exactly the field tier resolution branches on, so
 * a test can assert that a typed stage refuses the wrong one without inventing
 * its own catalogue.
 */
export const SCRIPTED_MODELS: readonly ModelDescriptor[] = [
  {
    contextWindow: 128_000,
    creator: "Scripted",
    default: true,
    displayName: "Scripted (typed)",
    id: "scripted-typed",
    maxOutputTokens: 32_000,
    pricing: DEFAULT_PRICING,
    providerId: SCRIPTED_PROVIDER_ID,
    structuredOutput: true,
  },
  {
    contextWindow: 128_000,
    creator: "Scripted",
    displayName: "Scripted (untyped)",
    id: "scripted-untyped",
    maxOutputTokens: 4_000,
    pricing: DEFAULT_PRICING,
    providerId: SCRIPTED_PROVIDER_ID,
    structuredOutput: false,
  },
];

/** A turn that emits `object` as JSON and stops. The commonest fixture. */
export const respondingWith = (object: unknown): ScriptedTurn => ({
  deltas: [JSON.stringify(object)],
});

export const createScriptedProvider = (
  script: readonly ScriptedTurn[],
): ScriptedProvider => {
  const requests: ModelRequest[] = [];
  let index = 0;

  async function* stream(
    request: ModelRequest,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    requests.push(request);
    const turn = script[index];
    index += 1;
    if (turn === undefined) {
      // Not an empty stream: a stage that asked for a turn the script does not
      // have is a test whose script is short, and a silent `end_turn` would
      // make it look like the stage decided to stop.
      throw new AuteurError(
        "internal",
        `The script has ${script.length.toString()} turn(s) and the pipeline asked for ${index.toString()}.`,
      );
    }

    for (const delta of turn.deltas ?? []) {
      if (signal.aborted) {
        yield {
          error: new AuteurError("cancelled", "The session was cancelled."),
          type: "error",
        };
        return;
      }
      if (turn.delayMs !== undefined) await Bun.sleep(turn.delayMs);
      yield { text: delta, type: "text_delta" };
    }

    if (signal.aborted) {
      yield {
        error: new AuteurError("cancelled", "The session was cancelled."),
        type: "error",
      };
      return;
    }

    if (turn.error !== undefined) {
      yield { error: turn.error, type: "error" };
      return;
    }

    yield {
      reason: turn.stop ?? "end_turn",
      type: "stop",
      usage: {
        inputTokens: turn.usage?.inputTokens ?? 1000,
        outputTokens:
          turn.usage?.outputTokens ?? (turn.deltas ?? []).join("").length,
        ...(turn.usage?.cachedInputTokens !== undefined && {
          cachedInputTokens: turn.usage.cachedInputTokens,
        }),
      },
    };
  }

  return {
    id: SCRIPTED_PROVIDER_ID,
    models: () => SCRIPTED_MODELS,
    remaining: () => Math.max(script.length - index, 0),
    requests,
    stream,
  };
};
