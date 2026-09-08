import { describe, expect, test } from "bun:test";
import type { ProviderEvent } from "@auteur/model-provider/provider";
import { toProviderEvents } from "../../src/responses-stream.ts";
import {
  readFixture,
  responsesStream,
  TEST_API_KEY,
} from "../fixtures/replay.ts";

const collect = async (
  fixture: string,
): Promise<{ events: ProviderEvent[]; finished: boolean }> => {
  const stream = await responsesStream(await readFixture(fixture));
  const iterator = toProviderEvents(stream, TEST_API_KEY);
  const events: ProviderEvent[] = [];
  let finished = false;
  for (;;) {
    const next = await iterator.next();
    if (next.done === true) {
      finished = next.value;
      break;
    }
    events.push(next.value);
  }
  return { events, finished };
};

const textOf = (events: readonly ProviderEvent[]): string =>
  events
    .filter((event) => event.type === "text_delta")
    .map((event) => event.text)
    .join("");

const stopOf = (events: readonly ProviderEvent[]) =>
  events.find((event) => event.type === "stop");

describe("a plain text turn", () => {
  test("yields its deltas in order and one terminal stop", async () => {
    const { events, finished } = await collect("text-turn.sse");
    expect(textOf(events)).toBe("The lamp turned.");
    expect(events.at(-1)?.type).toBe("stop");
    expect(stopOf(events)?.reason).toBe("end_turn");
    expect(finished).toBe(true);
  });

  test("an empty delta is not emitted", async () => {
    // An empty text_delta is not a fragment of anything, and a consumer that
    // renders per event would draw a frame for nothing.
    const { events } = await collect("empty-first-delta.sse");
    expect(events.filter((event) => event.type === "text_delta")).toHaveLength(
      1,
    );
  });
});

describe("two message items are two messages", () => {
  test("a change of item is a paragraph break, not a concatenation", async () => {
    // Gluing them runs "…before the answer." into "## The answer", and the
    // heading a blank line would have opened becomes two characters in the
    // middle of a sentence.
    const { events } = await collect("two-message-items.sse");
    expect(textOf(events)).toBe("A note before the answer.\n\n## The answer");
  });
});

describe("the terminal event is the authority", () => {
  test("a refusal with no streamed deltas still stops as a refusal", async () => {
    // It arrives as a `refusal` content part. A turn refused without deltas
    // would otherwise report end_turn — an answer that says nothing, recorded
    // as a normal answer.
    const { events } = await collect("refusal.sse");
    expect(stopOf(events)?.reason).toBe("refusal");
  });

  test("content_filter is a refusal by another name", async () => {
    const { events } = await collect("content-filter.sse");
    expect(stopOf(events)?.reason).toBe("refusal");
  });

  test("max_output_tokens stops as max_tokens, keeping the text it had", async () => {
    // The one stop reason a caller must not treat as success: a truncated
    // draft that every layer above reports as complete is worse than an error.
    const { events } = await collect("truncated-max-tokens.sse");
    expect(stopOf(events)?.reason).toBe("max_tokens");
    expect(textOf(events)).toBe("The lamp turned. The sea");
  });

  test("a reasoning item carries nothing this layer needs", async () => {
    const { events } = await collect("reasoning-item.sse");
    expect(stopOf(events)?.reason).toBe("end_turn");
    expect(textOf(events)).toBe("Done.");
  });

  test("an item type this adapter cannot read is an error, not a silent drop", async () => {
    // Dropping one leaves a turn that tried to do something, stopped end_turn,
    // and looks exactly like a turn that answered.
    await expect(collect("unknown-item.sse")).rejects.toThrow("cannot read");
  });
});

describe("usage partitions the input", () => {
  test("cached tokens are subtracted out of the total, not counted twice", async () => {
    // The API reports a total with the cached count as a subset of it. Copying
    // the total across bills the cached tokens at the full rate, and nothing
    // catches it until an invoice.
    const { events } = await collect("text-turn.sse");
    const stop = stopOf(events);
    if (stop?.type !== "stop") throw new Error("no stop");
    expect(stop.usage.inputTokens).toBe(1000);
    expect(stop.usage.cachedInputTokens).toBe(200);
    // The invariant, asserted as an invariant rather than as three numbers: if
    // the relationship is the other way round, this stops matching.
    expect(stop.usage.inputTokens + (stop.usage.cachedInputTokens ?? 0)).toBe(
      1200,
    );
  });

  test("a payload with no details block does not crash the generator", async () => {
    // `ResponseUsage` marks the details required and the SDK validates framing
    // rather than payloads, so a response missing them typechecks its way to a
    // TypeError out of a generator whose contract is that it throws
    // AuteurError and nothing else.
    const { events } = await collect("usage-missing-details.sse");
    const stop = stopOf(events);
    if (stop?.type !== "stop") throw new Error("no stop");
    expect(stop.usage).toEqual({
      cachedInputTokens: 0,
      inputTokens: 100,
      outputTokens: 10,
    });
  });

  test("a breakdown larger than its total floors at zero", async () => {
    const { events } = await collect("usage-overflow.sse");
    const stop = stopOf(events);
    if (stop?.type !== "stop") throw new Error("no stop");
    expect(stop.usage.inputTokens).toBe(0);
  });
});

describe("a failure after the 200", () => {
  test("an in-stream rate limit is rate_limited, not provider_error", async () => {
    // The response was a 200 and the trouble started after the headers, so the
    // frame's code is the whole signal. A rate limit recorded as a model
    // failure is indistinguishable from one, and the two want opposite
    // responses.
    await expect(collect("mid-stream-rate-limit.sse")).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  test("and the key it quoted back is redacted before it is stored", async () => {
    // An authentication failure quotes the key it rejected, and a detail is
    // serialised into a log line.
    try {
      await collect("mid-stream-rate-limit.sse");
      throw new Error("should have thrown");
    } catch (thrown) {
      const detail = (thrown as { detail?: { reason?: string } }).detail;
      expect(detail?.reason).not.toContain(TEST_API_KEY);
      expect(detail?.reason).toContain("[redacted]");
    }
  });

  test("any other in-stream error is provider_error", async () => {
    await expect(collect("mid-stream-error.sse")).rejects.toMatchObject({
      code: "provider_error",
    });
  });

  test("response.failed carries the provider's reason into detail", async () => {
    try {
      await collect("failed.sse");
      throw new Error("should have thrown");
    } catch (thrown) {
      const error = thrown as { code?: string; detail?: { reason?: string } };
      expect(error.code).toBe("provider_error");
      expect(error.detail?.reason).toBe("all candidates failed");
    }
  });
});

describe("a stream that stops without a terminal event", () => {
  test("returns false and keeps the text it had", async () => {
    // The caller decides whether that was a truncation or a cancellation it
    // asked for; this fold does not guess.
    const { events, finished } = await collect("no-terminal-event.sse");
    expect(finished).toBe(false);
    expect(textOf(events)).toBe("The lamp ");
    expect(stopOf(events)).toBeUndefined();
  });
});
