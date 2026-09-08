import { describe, expect, test } from "bun:test";
import { createFlusher, FLUSH_INTERVAL_MS } from "./flush.ts";

const atClock = (start = 0) => {
  let now = start;
  return { advance: (ms: number) => (now += ms), now: () => now };
};

describe("a fast stream flushes on time", () => {
  test("nothing is emitted before the interval", () => {
    const clock = atClock();
    const flusher = createFlusher({ now: clock.now });
    expect(flusher.push("one ")).toBeUndefined();
    expect(flusher.push("two ")).toBeUndefined();
    expect(flusher.pending()).toBe("one two ");
  });

  test("the interval flushes what has accumulated", () => {
    const clock = atClock();
    const flusher = createFlusher({ now: clock.now });
    flusher.push("one ");
    clock.advance(FLUSH_INTERVAL_MS);
    expect(flusher.push("two")).toBe("one two");
  });

  test("the clock restarts from the flush, not from the first push", () => {
    const clock = atClock();
    const flusher = createFlusher({ now: clock.now });
    clock.advance(FLUSH_INTERVAL_MS);
    flusher.push("one");
    clock.advance(FLUSH_INTERVAL_MS - 1);
    expect(flusher.push("two")).toBeUndefined();
  });
});

describe("a slow stream flushes at a paragraph", () => {
  test("a blank line flushes regardless of the clock", () => {
    // Otherwise a slow model's reader watches a half-sentence sit there.
    const clock = atClock();
    const flusher = createFlusher({ now: clock.now });
    expect(flusher.push("The lamp turned.\n\n")).toBe("The lamp turned.\n\n");
  });

  test("a boundary split across two deltas is still a boundary", () => {
    // The ordinary case with a token stream, and checking the delta alone
    // would miss every one of them.
    const clock = atClock();
    const flusher = createFlusher({ now: clock.now });
    expect(flusher.push("The lamp turned.\n")).toBeUndefined();
    expect(flusher.push("\nThe sea did not.")).toBe(
      "The lamp turned.\n\nThe sea did not.",
    );
  });

  test("a single newline is not a paragraph", () => {
    const clock = atClock();
    const flusher = createFlusher({ now: clock.now });
    expect(flusher.push("a line\nanother line")).toBeUndefined();
  });
});

describe("draining", () => {
  test("the tail is emitted when the stream ends", () => {
    const clock = atClock();
    const flusher = createFlusher({ now: clock.now });
    flusher.push("the last words");
    expect(flusher.drain()).toBe("the last words");
  });

  test("draining an empty buffer emits nothing, not an empty delta", () => {
    // An empty stage_delta is a frame the client renders for no text.
    const clock = atClock();
    const flusher = createFlusher({ now: clock.now });
    expect(flusher.drain()).toBeUndefined();
  });
});
