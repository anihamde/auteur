import { describe, expect, test } from "bun:test";
import type {
  ModelProvider,
  ProviderEvent,
} from "@auteur/model-provider/provider";
import type { ModelRequest } from "@auteur/model-provider/request";

/**
 * The conformance suite an adapter passes — written against the contract alone.
 *
 * There is one adapter, `@auteur/provider-router`, so the suite runs once.
 * What it enforces is the rule that made it worth writing anyway: **if a
 * behaviour can only be asserted for one adapter, the contract is leaking.**
 * Anything provider-shaped — a wire field, an id format, a stop reason only one
 * vendor produces — belongs in that package's own suite. A file with no vendor
 * in it is what keeps `ModelProvider` a contract rather than a description of
 * its only implementation.
 *
 * It lives here rather than in the adapter so an adapter can import it without
 * reaching sideways by relative path — which the dependency gate cannot see,
 * because that gate reads `package.json` rather than imports. `test-support` is
 * a `test`-layer package and the gate permits one as a devDependency from any
 * layer, so the edge is declared and visible.
 */

/** The scenarios every adapter must be able to replay, named by behaviour. */
export type ConformanceScenario =
  | "text-turn"
  | "stop-max-tokens"
  | "stop-refusal"
  | "usage-cached"
  | "rate-limited"
  | "model-unavailable"
  | "server-error"
  | "truncated";

export type ConformanceProvider = {
  readonly provider: ModelProvider;
  /** Whether the request was cancelled rather than left open. */
  readonly wasCancelled: () => boolean;
};

export type ConformanceTarget = {
  readonly name: string;
  /** Build a provider replaying the named scenario. */
  readonly providerFor: (
    scenario: ConformanceScenario,
  ) => Promise<ConformanceProvider>;
  /** A provider that holds the connection open until it is cancelled. */
  readonly hangingProvider: () => Promise<ConformanceProvider>;
  /** A model id this adapter's catalogue declares. */
  readonly modelId: string;
};

const aRequest = (modelId: string): ModelRequest => ({
  input: "The idea: a lighthouse keeper who has never seen the sea.",
  maxTokens: 4096,
  modelId,
  system: "You are a stage in a pipeline.",
});

const drain = async (
  provider: ModelProvider,
  modelId: string,
  signal = new AbortController().signal,
): Promise<ProviderEvent[]> => {
  const events: ProviderEvent[] = [];
  for await (const event of provider.stream(aRequest(modelId), signal)) {
    events.push(event);
  }
  return events;
};

const textOf = (events: readonly ProviderEvent[]): string =>
  events
    .filter((event) => event.type === "text_delta")
    .map((event) => event.text)
    .join("");

const terminalOf = (events: readonly ProviderEvent[]): ProviderEvent => {
  const last = events.at(-1);
  if (last === undefined) throw new Error("the stream yielded nothing");
  return last;
};

const codeOf = (events: readonly ProviderEvent[]): string => {
  const terminal = terminalOf(events);
  if (terminal.type !== "error") {
    throw new Error(`expected a terminal error, got ${terminal.type}`);
  }
  return terminal.error.code;
};

/**
 * Run the suite against one adapter.
 *
 * Call it inside the adapter's own test file. It declares its own `describe`,
 * so the adapter's file reads as the list of contracts it is held to.
 */
export const runConformanceSuite = (target: ConformanceTarget): void => {
  describe(`${target.name} conforms to ModelProvider`, () => {
    test("declares models, all carrying its own provider id", async () => {
      const { provider } = await target.providerFor("text-turn");
      const models = provider.models();
      expect(models.length).toBeGreaterThan(0);
      for (const model of models) {
        expect(model.providerId).toBe(provider.id);
      }
    });

    test("a text turn yields its deltas and exactly one terminal stop", async () => {
      // The terminal event is the contract: a consumer knows the turn is over
      // because the stream said so, not because iteration ended.
      const { provider } = await target.providerFor("text-turn");
      const events = await drain(provider, target.modelId);
      expect(textOf(events).length).toBeGreaterThan(0);
      expect(terminalOf(events).type).toBe("stop");
      expect(events.filter((event) => event.type === "stop")).toHaveLength(1);
    });

    test("a truncated turn reports max_tokens, not end_turn", async () => {
      // The one stop reason a caller must not treat as success. A truncated
      // draft reported as complete is worse than an error: nothing is red, and
      // the reader takes a half-story for a whole one.
      const { provider } = await target.providerFor("stop-max-tokens");
      const terminal = terminalOf(await drain(provider, target.modelId));
      expect(terminal.type).toBe("stop");
      if (terminal.type !== "stop") return;
      expect(terminal.reason).toBe("max_tokens");
    });

    test("a refusal reports refusal, whether or not it was streamed", async () => {
      const { provider } = await target.providerFor("stop-refusal");
      const terminal = terminalOf(await drain(provider, target.modelId));
      expect(terminal.type).toBe("stop");
      if (terminal.type !== "stop") return;
      expect(terminal.reason).toBe("refusal");
    });

    test("cached input tokens are reported apart from fresh ones", async () => {
      // They are billed at a fraction of the rate, so a caller that added them
      // together would lose the only information that made them worth
      // reporting — and an adapter whose gateway reports a total must subtract
      // it out rather than copying it across.
      const { provider } = await target.providerFor("usage-cached");
      const terminal = terminalOf(await drain(provider, target.modelId));
      expect(terminal.type).toBe("stop");
      if (terminal.type !== "stop") return;
      expect(terminal.usage.cachedInputTokens ?? 0).toBeGreaterThan(0);
      expect(terminal.usage.inputTokens).toBeGreaterThan(0);
    });

    test("no vendor error escapes: every failure is an AuteurError event", async () => {
      // Everything upstream catches AuteurError and nothing else. An SDK error
      // reaching a route would be an untyped 500 carrying a vendor's wording
      // into a product surface.
      for (const scenario of [
        "rate-limited",
        "model-unavailable",
        "server-error",
      ] as const) {
        const { provider } = await target.providerFor(scenario);
        const terminal = terminalOf(await drain(provider, target.modelId));
        expect(terminal.type).toBe("error");
        if (terminal.type !== "error") continue;
        expect(terminal.error.name).toBe("AuteurError");
      }
    });

    test("the taxonomy distinguishes the three failures a caller acts on", async () => {
      // A rate limit is retried, an unavailable model is repinned, and a
      // gateway failure is neither. Folding them into one code makes all three
      // the same non-decision.
      expect(
        codeOf(
          await drain(
            (await target.providerFor("rate-limited")).provider,
            target.modelId,
          ),
        ),
      ).toBe("rate_limited");
      expect(
        codeOf(
          await drain(
            (await target.providerFor("model-unavailable")).provider,
            target.modelId,
          ),
        ),
      ).toBe("model_unavailable");
      expect(
        codeOf(
          await drain(
            (await target.providerFor("server-error")).provider,
            target.modelId,
          ),
        ),
      ).toBe("provider_error");
    });

    test("a stream cut mid-turn is an error, not a completed turn", async () => {
      const { provider } = await target.providerFor("truncated");
      const terminal = terminalOf(await drain(provider, target.modelId));
      expect(terminal.type).toBe("error");
    });

    test("the deltas already yielded survive a mid-stream failure", async () => {
      // The stream is an AsyncIterable the caller is partway through
      // consuming: the deltas are real, and the failure is part of the same
      // sequence rather than an unwinding of it.
      const { provider } = await target.providerFor("rate-limited");
      const events = await drain(provider, target.modelId);
      expect(events.at(-1)?.type).toBe("error");
      expect(events.length).toBeGreaterThan(1);
    });

    test("aborting the signal ends the stream and cancels the request", async () => {
      // Not merely stopping the iteration: the request has to be cancelled, or
      // a cancelled session keeps paying for a call nobody will read.
      const { provider, wasCancelled } = await target.hangingProvider();
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, 50);
      try {
        await drain(provider, target.modelId, controller.signal);
      } finally {
        clearTimeout(timer);
      }
      expect(wasCancelled()).toBe(true);
    }, 15_000);
  });
};
