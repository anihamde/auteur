import { describe, expect, test } from "bun:test";
import type { ModelRequest } from "@auteur/model-provider/request";
import { createRouterProvider } from "../../src/client.ts";
import {
  failing,
  hanging,
  networkFailure,
  readFixture,
  replaying,
  TEST_API_KEY,
  type Transport,
} from "../fixtures/replay.ts";

const aRequest = (overrides: Partial<ModelRequest> = {}): ModelRequest => ({
  input: "The idea: a lighthouse keeper who has never seen the sea.",
  maxTokens: 4096,
  modelId: "gpt-5",
  system: "You select works.",
  ...overrides,
});

const play = async (
  transport: Transport,
  request = aRequest(),
  signal = new AbortController().signal,
) => {
  const provider = createRouterProvider({
    apiKey: TEST_API_KEY,
    client: transport.client,
  });
  const events = [];
  for await (const event of provider.stream(request, signal)) {
    events.push(event);
  }
  return events;
};

const errorOf = (events: readonly { type: string }[]) => {
  const found = events.find((event) => event.type === "error");
  if (found === undefined) throw new Error("no error event");
  return found as { type: "error"; error: { code: string; detail?: unknown } };
};

describe("the request the adapter sends", () => {
  test("carries the system prompt as instructions and no stored copy", async () => {
    // The Responses API stores the response for later retrieval by default.
    // Nothing here retrieves one, and a stage's input carries the user's idea
    // and an author's prose.
    const transport = replaying(await readFixture("text-turn.sse"));
    await play(transport);
    expect(transport.calls[0]?.body).toMatchObject({
      instructions: "You select works.",
      max_output_tokens: 4096,
      model: "gpt-5",
      store: false,
      stream: true,
    });
  });

  test("sets a strict json_schema exactly when the stage is typed", async () => {
    // The whole of the structured-output work (ARCHITECTURE.md §6.4).
    const typed = replaying(await readFixture("text-turn.sse"));
    await play(
      typed,
      aRequest({
        format: {
          name: "outline",
          schema: { properties: {}, type: "object" },
          strict: true,
        },
      }),
    );
    expect(typed.calls[0]?.body).toMatchObject({
      text: {
        format: {
          name: "outline",
          schema: { properties: {}, type: "object" },
          strict: true,
          type: "json_schema",
        },
      },
    });

    const untyped = replaying(await readFixture("text-turn.sse"));
    await play(untyped);
    expect(untyped.calls[0]?.body).not.toHaveProperty("text");
  });
});

describe("failures reach the caller as a terminal error event", () => {
  test("no openai SDK error ever escapes", async () => {
    // Everything upstream catches AuteurError and nothing else; an APIError
    // reaching a route would be an untyped 500 carrying a vendor's wording
    // into a product surface.
    const events = await play(
      failing(500, await readFixture("server-error.json")),
    );
    expect(errorOf(events).error.code).toBe("provider_error");
  });

  test("a 429 is rate_limited", async () => {
    const events = await play(
      failing(429, await readFixture("rate-limited.json")),
    );
    expect(errorOf(events).error.code).toBe("rate_limited");
  });

  test("a 404 on a pinned model is model_unavailable, not a generic failure", async () => {
    // Almost always a stage_pins row outliving a catalogue entry. It is the
    // panel's to fix rather than the pipeline's to retry.
    const events = await play(
      failing(404, await readFixture("model-not-found.json")),
    );
    expect(errorOf(events).error.code).toBe("model_unavailable");
  });

  test("a 401 does not echo the key it rejected", async () => {
    const events = await play(
      failing(401, await readFixture("authentication-error.json")),
    );
    const detail = errorOf(events).error.detail as { reason: string };
    expect(detail.reason).not.toContain(TEST_API_KEY);
    expect(detail.reason).toContain("[redacted]");
  });

  test("a severed socket is provider_error, not a completed turn", async () => {
    const events = await play(networkFailure());
    expect(errorOf(events).error.code).toBe("provider_error");
  });

  test("the deltas already yielded survive the failure", async () => {
    // The stream is an AsyncIterable the caller is partway through consuming:
    // the deltas are real, and the failure is part of the same sequence rather
    // than an unwinding of it.
    const events = await play(
      replaying(await readFixture("mid-stream-rate-limit.sse")),
    );
    expect(events[0]).toEqual({ text: "The lamp ", type: "text_delta" });
    expect(errorOf(events).error.code).toBe("rate_limited");
  });

  test("a stream that ends with no terminal event is not reported as complete", async () => {
    const events = await play(
      replaying(await readFixture("no-terminal-event.sse")),
    );
    expect(errorOf(events).error.code).toBe("provider_error");
  });
});

describe("cancellation", () => {
  test("an abort ends the iteration and is cancelled, not a gateway failure", async () => {
    // What an abort has to interrupt: a response that has begun and has more
    // coming. The transport errors its body the way a severed socket does,
    // which is what the SDK sees in production — and the adapter has to tell
    // that apart from a gateway failure, because a cancelled session is not a
    // failed one.
    const controller = new AbortController();
    const transport = hanging(
      `event: response.created\ndata: ${JSON.stringify({
        response: {
          created_at: 1,
          error: null,
          id: "r",
          incomplete_details: null,
          instructions: null,
          metadata: null,
          model: "gpt-5",
          object: "response",
          output: [],
          output_text: "",
          parallel_tool_calls: false,
          status: "in_progress",
          temperature: 1,
          tool_choice: "auto",
          tools: [],
          top_p: 1,
        },
        sequence_number: 1,
        type: "response.created",
      })}\n\n`,
    );
    const provider = createRouterProvider({
      apiKey: TEST_API_KEY,
      client: transport.client,
    });

    const timer = setTimeout(() => {
      controller.abort();
    }, 50);
    const events = [];
    try {
      for await (const event of provider.stream(
        aRequest(),
        controller.signal,
      )) {
        events.push(event);
      }
    } finally {
      clearTimeout(timer);
    }

    expect(transport.wasCancelled()).toBe(true);
    expect(errorOf(events).error.code).toBe("cancelled");
  }, 15_000);
});

describe("the provider declares the catalogue", () => {
  test("models() is the catalogue, with this provider's id on every row", async () => {
    const provider = createRouterProvider({ apiKey: TEST_API_KEY });
    const models = provider.models();
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(model.providerId).toBe(provider.id);
    }
  });
});
