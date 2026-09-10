import { describe, expect, test } from "bun:test";
import { AuteurError } from "./auteur-error.ts";
import { detailLine } from "./detail-line.ts";

/**
 * Whether a failed stage can say anything but "The model gateway failed."
 *
 * Four failures for four reasons produced that one sentence four times, and
 * the reason was already computed and already redacted — it was thrown away
 * one call before anybody could read it.
 */

const providerError = (detail: Record<string, unknown>) =>
  new AuteurError("provider_error", "The model gateway failed.", { detail });

describe("the gateway's own label survives", () => {
  test("code and status are both carried, code first", () => {
    // Two 400s that want opposite responses: one is a prompt to shorten, the
    // other is a card to top up.
    expect(
      detailLine(
        providerError({
          code: "context_length_exceeded",
          reason: "This model's maximum context length is 200000 tokens.",
          status: 400,
        }),
      ),
    ).toBe(
      "context_length_exceeded HTTP 400: This model's maximum context length is 200000 tokens.",
    );
  });

  test("a stream failure with no status is still a line", () => {
    // A stream that fails after its 200 has no status to read; the frame's
    // code is the whole signal.
    expect(
      detailLine(
        providerError({ code: "rate_limit_exceeded", reason: "Slow down." }),
      ),
    ).toBe("rate_limit_exceeded: Slow down.");
  });

  test("neither label leaves the reason unprefixed rather than punctuated", () => {
    expect(detailLine(providerError({ reason: "Connection reset." }))).toBe(
      "Connection reset.",
    );
  });
});

describe("what does not become a line", () => {
  test("a detail with no reason produces nothing", () => {
    // `schema_violation` carries a zod issue tree. Rendering it would put a
    // paragraph of JSON paths on the research screen.
    expect(
      detailLine(
        new AuteurError("schema_violation", "Not a card.", {
          detail: { issues: [{ code: "invalid_type", path: ["fields"] }] },
        }),
      ),
    ).toBeUndefined();
  });

  test("an error with no detail at all produces nothing", () => {
    expect(detailLine(new AuteurError("internal", "The stage failed."))).toBe(
      undefined,
    );
  });

  test("a non-string reason is not coerced", () => {
    expect(detailLine(providerError({ reason: { nested: true } }))).toBe(
      undefined,
    );
  });
});

describe("a provider that answers with a page does not become the page", () => {
  test("a long reason is truncated with a mark that says so", () => {
    // A gateway behind a proxy can answer a 502 with an HTML error page, and
    // its whole body arrives as `reason`.
    const line = detailLine(providerError({ reason: "x".repeat(5000) }));
    expect(line).toHaveLength(241);
    expect(line?.endsWith("…")).toBe(true);
  });
});
