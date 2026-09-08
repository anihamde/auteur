import type { SessionEvent } from "@auteur/core/events";
import type { Stage } from "@auteur/core/pipeline";
import { AuteurError } from "@auteur/errors/auteur-error";
import type { ModelDescriptor } from "@auteur/model-provider/descriptor";
import type {
  ModelProvider,
  ProviderEvent,
} from "@auteur/model-provider/provider";
import type { ModelRequest } from "@auteur/model-provider/request";
import { createFlusher } from "./flush.ts";
import { accountFor, cancelledUsage, type StageUsage } from "./usage.ts";

/**
 * The engine: **one stage, one invocation**.
 *
 * There is no loop here, and that is `ARCHITECTURE.md` §5.3 rather than a
 * simplification. The chain is `stage_queue`'s: a stage's last act is to
 * enqueue the next, and a one-minute cron sweep re-invokes whatever a lost
 * invocation left behind. A loop in this file would be a loop inside one
 * function invocation, which is the long-running process the topology does not
 * have.
 *
 * So `runStage` runs exactly one stage and returns what to enqueue. It holds no
 * knowledge of what any stage *means*: it resolves a model, sends a request,
 * turns provider events into session events, and reports usage. `clarify` is
 * the one stage that re-enters itself, and it does so by returning itself as
 * the next stage — bounded by `clarify.ts`'s budget rather than by anything
 * here.
 *
 * **No I/O of its own.** Every store, the clock and the provider are handed in.
 * `no-io.test.ts` asserts that against the source, because the property is what
 * makes a full run testable against a scripted provider with no database and no
 * network.
 */

export type StageOutcome =
  | {
      readonly status: "ok";
      readonly text: string;
      readonly usage: StageUsage;
      /** What to enqueue next. Empty ends the run. */
      readonly next: readonly string[];
    }
  | {
      readonly status: "error";
      readonly error: AuteurError;
      readonly usage: StageUsage;
    }
  | { readonly status: "cancelled"; readonly usage: StageUsage };

export type RunStageInput = {
  readonly stage: Stage;
  readonly model: ModelDescriptor;
  readonly provider: ModelProvider;
  readonly request: ModelRequest;
  readonly signal: AbortSignal;
  /** What to enqueue when this stage succeeds. */
  readonly next: readonly string[];
  /** Injected: the engine reads no clock of its own. */
  readonly now: () => number;
  /** Emitted in order. The caller appends them; the engine does not write. */
  readonly emit: (event: SessionEvent) => void;
};

/**
 * Run one stage.
 *
 * Events are emitted through the callback rather than yielded, because the
 * caller has to **append each one to the durable log before it is pushed to a
 * subscriber** (§7.3) — and a generator would let a caller consume the whole
 * sequence and write it afterwards, which is exactly the ordering the log
 * forbids.
 */
export const runStage = async (input: RunStageInput): Promise<StageOutcome> => {
  const started = input.now();
  input.emit({
    modelId: input.model.id,
    role: input.stage.role,
    stageId: input.stage.id,
    type: "stage_start",
    ...(input.stage.tier !== undefined && { tier: input.stage.tier }),
  });

  const flusher = createFlusher({ now: input.now });
  let text = "";
  let usage: StageUsage = cancelledUsage(undefined, input.model.pricing);

  const finish = (elapsed: number, accounted: StageUsage): void => {
    input.emit({
      costMicros: accounted.costMicros,
      elapsedMs: elapsed,
      stageId: input.stage.id,
      type: "stage_end",
      usage: {
        cachedInputTokens: accounted.cachedInputTokens,
        inputTokens: accounted.inputTokens,
        outputTokens: accounted.outputTokens,
      },
    });
  };

  for await (const event of input.provider.stream(
    input.request,
    input.signal,
  )) {
    const handled = handleProviderEvent(event, {
      emit: input.emit,
      flusher,
      model: input.model,
      stageId: input.stage.id,
      streams: input.stage.streams,
    });
    text += handled.text;
    if (handled.usage !== undefined) usage = handled.usage;

    if (handled.failure !== undefined) {
      const elapsed = input.now() - started;
      finish(elapsed, usage);
      if (handled.failure.code === "cancelled") {
        return { status: "cancelled", usage };
      }
      input.emit({
        code: handled.failure.code,
        message: handled.failure.message,
        stageId: input.stage.id,
        type: "stage_error",
      });
      return { error: handled.failure, status: "error", usage };
    }
  }

  const tail = flusher.drain();
  if (tail !== undefined && input.stage.streams) {
    input.emit({ stageId: input.stage.id, text: tail, type: "stage_delta" });
  }
  finish(input.now() - started, usage);
  return { next: input.next, status: "ok", text, usage };
};

type HandleContext = {
  readonly stageId: string;
  readonly streams: boolean;
  readonly model: ModelDescriptor;
  readonly flusher: ReturnType<typeof createFlusher>;
  readonly emit: (event: SessionEvent) => void;
};

type Handled = {
  readonly text: string;
  readonly usage?: StageUsage;
  readonly failure?: AuteurError;
};

/**
 * One provider event.
 *
 * A truncation — `stop` with `max_tokens` — is a **failure**, not a completion.
 * A stage that returns a half-response and reports success produces a card with
 * a missing field or a story that stops mid-sentence, and every layer above
 * calls it done. That is the one stop reason a caller must never treat as
 * success, and this is the one place it is decided.
 */
const handleProviderEvent = (
  event: ProviderEvent,
  context: HandleContext,
): Handled => {
  switch (event.type) {
    case "text_delta": {
      const flushed = context.flusher.push(event.text);
      if (flushed !== undefined && context.streams) {
        context.emit({
          stageId: context.stageId,
          text: flushed,
          type: "stage_delta",
        });
      }
      return { text: event.text };
    }
    case "stop": {
      const usage = accountFor(event.usage, context.model.pricing);
      if (event.reason === "max_tokens") {
        return {
          failure: new AuteurError(
            "provider_error",
            "The model ran out of room before finishing this stage.",
            { detail: { stage: context.stageId } },
          ),
          text: "",
          usage,
        };
      }
      if (event.reason === "refusal") {
        return {
          failure: new AuteurError(
            "provider_error",
            "The model declined to produce this stage's output.",
            { detail: { stage: context.stageId } },
          ),
          text: "",
          usage,
        };
      }
      return { text: "", usage };
    }
    case "error": {
      return { failure: event.error, text: "" };
    }
    default: {
      return { text: "" };
    }
  }
};
