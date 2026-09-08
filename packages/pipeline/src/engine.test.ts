import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SessionEvent } from "@auteur/core/events";
import type { Stage } from "@auteur/core/pipeline";
import { AuteurError } from "@auteur/errors/auteur-error";
import {
  createScriptedProvider,
  SCRIPTED_MODELS,
  type ScriptedTurn,
} from "@auteur/test-support/scripted-provider";
import { runStage } from "./engine.ts";

const MODEL = SCRIPTED_MODELS[0];
if (MODEL === undefined) throw new Error("no scripted model");

const stage = (overrides: Partial<Stage> = {}): Stage => ({
  id: "draft",
  promptId: "draft",
  reads: [],
  role: "draft",
  streams: true,
  tier: "strong",
  typed: false,
  ...overrides,
});

const run = async (
  script: readonly ScriptedTurn[],
  overrides: {
    stage?: Stage;
    signal?: AbortSignal;
    next?: readonly string[];
  } = {},
) => {
  const events: SessionEvent[] = [];
  let now = 0;
  const outcome = await runStage({
    emit: (event) => events.push(event),
    model: MODEL,
    next: overrides.next ?? ["critique"],
    now: () => (now += 100),
    provider: createScriptedProvider(script),
    request: {
      input: "the beats",
      maxTokens: 4096,
      modelId: MODEL.id,
      system: "write prose",
    },
    signal: overrides.signal ?? new AbortController().signal,
    stage: overrides.stage ?? stage(),
  });
  return { events, outcome };
};

const types = (events: readonly SessionEvent[]): string[] =>
  events.map((event) => event.type);

describe("a successful stage", () => {
  test("emits start, deltas, and exactly one end", async () => {
    const { events, outcome } = await run([
      { deltas: ["The lamp turned.\n\n", "The sea did not."] },
    ]);
    expect(types(events)).toEqual([
      "stage_start",
      "stage_delta",
      "stage_delta",
      "stage_end",
    ]);
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.text).toBe("The lamp turned.\n\nThe sea did not.");
  });

  test("it returns what to enqueue, and runs no loop", async () => {
    // There is no loop in this file, and that is §5.3 rather than a
    // simplification: the chain is stage_queue's, and a loop here would be a
    // loop inside one function invocation.
    const { outcome } = await run([{ deltas: ["x"] }], { next: ["critique"] });
    expect(outcome.status === "ok" && outcome.next).toEqual(["critique"]);
  });

  test("a non-streaming stage emits no deltas", async () => {
    // `streams: false` means a start and an end and no deltas, so the web app
    // has no branch for "stages that show progress".
    const { events } = await run([{ deltas: ["{}"] }], {
      stage: stage({ id: "outline", streams: false, typed: true }),
    });
    expect(types(events)).toEqual(["stage_start", "stage_end"]);
  });

  test("the end carries the usage and the cost", async () => {
    const { events } = await run([
      { deltas: ["x"], usage: { cachedInputTokens: 100, inputTokens: 900 } },
    ]);
    const end = events.at(-1);
    expect(end?.type).toBe("stage_end");
    if (end?.type !== "stage_end") return;
    expect(end.usage?.cachedInputTokens).toBe(100);
    expect(end.usage?.inputTokens).toBe(900);
    expect(end.costMicros).toBeGreaterThan(0);
  });

  test("the start names the model and the tier the panel renders", async () => {
    const { events } = await run([{ deltas: ["x"] }]);
    const start = events[0];
    expect(start?.type).toBe("stage_start");
    if (start?.type !== "stage_start") return;
    expect(start.modelId).toBe(MODEL.id);
    expect(start.tier).toBe("strong");
  });
});

describe("a truncation is a failure, not a completion", () => {
  test("max_tokens ends the stage with an error", async () => {
    // The one stop reason a caller must never treat as success: a stage that
    // returns a half-response and reports success produces a story that stops
    // mid-sentence and every layer above calls it done.
    const { events, outcome } = await run([
      { deltas: ["half a story"], stop: "max_tokens" },
    ]);
    expect(outcome.status).toBe("error");
    expect(types(events)).toContain("stage_error");
  });

  test("a refusal is an error too", async () => {
    const { outcome } = await run([{ deltas: [], stop: "refusal" }]);
    expect(outcome.status).toBe("error");
  });

  test("the usage from a failed call is still recorded", async () => {
    // A failed call is still a call the gateway charges for.
    const { outcome } = await run([
      { deltas: ["half"], stop: "max_tokens", usage: { inputTokens: 5000 } },
    ]);
    expect(outcome.usage.inputTokens).toBe(5000);
    expect(outcome.usage.costMicros).toBeGreaterThan(0);
  });
});

describe("a mid-stream failure", () => {
  test("the deltas before it are emitted, then the error", async () => {
    const { events, outcome } = await run([
      {
        deltas: ["The lamp turned.\n\n"],
        error: new AuteurError("rate_limited", "Slow down."),
      },
    ]);
    expect(types(events)).toEqual([
      "stage_start",
      "stage_delta",
      "stage_end",
      "stage_error",
    ]);
    expect(outcome.status).toBe("error");
    if (outcome.status !== "error") return;
    expect(outcome.error.code).toBe("rate_limited");
  });
});

describe("cancellation", () => {
  test("it ends the stage as cancelled, not as an error", async () => {
    const controller = new AbortController();
    controller.abort();
    const { events, outcome } = await run([{ deltas: ["never"] }], {
      signal: controller.signal,
    });
    expect(outcome.status).toBe("cancelled");
    // No stage_error: the reader asked for this.
    expect(types(events)).not.toContain("stage_error");
  });
});

describe("the engine does its own I/O nowhere", () => {
  test("it reads no clock, no filesystem and no network", () => {
    // Every store, the clock and the provider are handed in. That property is
    // what makes a full run testable against a scripted provider with no
    // database and no network.
    const source = readFileSync(
      fileURLToPath(new URL("./engine.ts", import.meta.url)),
      "utf8",
    );
    for (const forbidden of [
      "node:fs",
      "fetch(",
      "Date.now",
      "new Date(",
      "Math.random",
      "process.env",
      "Bun.env",
    ]) {
      expect([forbidden, source.includes(forbidden)]).toEqual([
        forbidden,
        false,
      ]);
    }
  });

  test("it imports no store", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./engine.ts", import.meta.url)),
      "utf8",
    );
    for (const store of ["session-store", "event-store", "stage-queue"]) {
      expect([store, source.includes(store)]).toEqual([store, false]);
    }
  });
});
