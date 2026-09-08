import { describe, expect, test } from "bun:test";
import { AuteurError } from "@auteur/errors/auteur-error";
import type { ProviderEvent } from "@auteur/model-provider/provider";
import type { ModelRequest } from "@auteur/model-provider/request";
import {
  createScriptedProvider,
  respondingWith,
  type ScriptedTurn,
} from "./scripted-provider.ts";

const aRequest = (): ModelRequest => ({
  input: "the idea",
  maxTokens: 1000,
  modelId: "scripted-typed",
  system: "a stage",
});

const drain = async (
  script: readonly ScriptedTurn[],
  signal = new AbortController().signal,
  turns = 1,
): Promise<ProviderEvent[]> => {
  const provider = createScriptedProvider(script);
  const events: ProviderEvent[] = [];
  for (let turn = 0; turn < turns; turn += 1) {
    for await (const event of provider.stream(aRequest(), signal)) {
      events.push(event);
    }
  }
  return events;
};

describe("a scripted turn replays exactly", () => {
  test("deltas in order, then one terminal stop", async () => {
    const events = await drain([{ deltas: ["The lamp ", "turned."] }]);
    expect(events).toEqual([
      { text: "The lamp ", type: "text_delta" },
      { text: "turned.", type: "text_delta" },
      {
        reason: "end_turn",
        type: "stop",
        usage: { inputTokens: 1000, outputTokens: 16 },
      },
    ]);
  });

  test("a truncation is a stop reason, not an error", async () => {
    const events = await drain([
      { deltas: ["half a story"], stop: "max_tokens" },
    ]);
    const terminal = events.at(-1);
    expect(terminal?.type).toBe("stop");
    if (terminal?.type !== "stop") return;
    expect(terminal.reason).toBe("max_tokens");
  });

  test("a mid-stream failure keeps the deltas that came before it", async () => {
    // The contract the pipeline is written against: the deltas already yielded
    // are real, and the failure is part of the same sequence.
    const events = await drain([
      {
        deltas: ["The lamp "],
        error: new AuteurError("rate_limited", "Slow down."),
      },
    ]);
    expect(events[0]).toEqual({ text: "The lamp ", type: "text_delta" });
    expect(events.at(-1)?.type).toBe("error");
  });

  test("respondingWith is a turn that emits one JSON document", async () => {
    const events = await drain([respondingWith({ done: true, questions: [] })]);
    const text = events
      .filter((event) => event.type === "text_delta")
      .map((event) => event.text)
      .join("");
    expect(JSON.parse(text)).toEqual({ done: true, questions: [] });
  });
});

describe("turns are taken in order", () => {
  test("a stage that runs twice takes the second turn", async () => {
    // How a test says "the retry succeeds" without a mock's call-count
    // matching.
    const provider = createScriptedProvider([
      { deltas: ["first"] },
      { deltas: ["second"] },
    ]);
    const read = async (): Promise<string> => {
      let text = "";
      for await (const event of provider.stream(
        aRequest(),
        new AbortController().signal,
      )) {
        if (event.type === "text_delta") text += event.text;
      }
      return text;
    };
    expect(await read()).toBe("first");
    expect(await read()).toBe("second");
    expect(provider.remaining()).toBe(0);
  });

  test("asking past the end throws, rather than looking like a decision to stop", async () => {
    // A silent `end_turn` would make a short script look like a stage that
    // chose to stop, which is the hardest kind of test failure to read.
    await expect(
      drain([{ deltas: ["only one"] }], undefined, 2),
    ).rejects.toThrow("asked for 2");
  });

  test("every request is recorded, so a test can assert what a stage sent", async () => {
    const provider = createScriptedProvider([{ deltas: ["x"] }]);
    for await (const _ of provider.stream(
      aRequest(),
      new AbortController().signal,
    )) {
      // drain
    }
    expect(provider.requests[0]?.system).toBe("a stage");
  });
});

describe("cancellation", () => {
  test("an aborted signal ends the turn as cancelled, before the next delta", async () => {
    const controller = new AbortController();
    controller.abort();
    const events = await drain(
      [{ deltas: ["never yielded"] }],
      controller.signal,
    );
    expect(events).toHaveLength(1);
    const terminal = events[0];
    expect(terminal?.type).toBe("error");
    if (terminal?.type !== "error") return;
    expect(terminal.error.code).toBe("cancelled");
  });

  test("aborting mid-stream stops after the delta in flight", async () => {
    const controller = new AbortController();
    const provider = createScriptedProvider([
      { delayMs: 5, deltas: ["one", "two", "three"] },
    ]);
    const events: ProviderEvent[] = [];
    for await (const event of provider.stream(aRequest(), controller.signal)) {
      events.push(event);
      if (events.length === 1) controller.abort();
    }
    expect(events.filter((event) => event.type === "text_delta")).toHaveLength(
      1,
    );
    expect(events.at(-1)?.type).toBe("error");
  });
});

describe("the two declared models differ where resolution branches", () => {
  test("one accepts a strict schema and one does not", async () => {
    // So a test can assert that a typed stage refuses the wrong model without
    // inventing its own catalogue.
    const models = createScriptedProvider([]).models();
    expect(models.map((model) => model.structuredOutput)).toEqual([
      true,
      false,
    ]);
    expect(models[0]?.maxOutputTokens).toBeGreaterThan(
      models[1]?.maxOutputTokens ?? 0,
    );
  });
});
