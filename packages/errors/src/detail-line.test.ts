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

describe("a schema violation names the field", () => {
  const violation = (issues: unknown) =>
    new AuteurError(
      "schema_violation",
      "style-extract returned JSON that is not the shape it declared.",
      { detail: { issues, stageId: "style-extract" } },
    );

  test("the path and zod's own message", () => {
    // The whole diagnosis of a stage that otherwise reports only that the
    // model returned the wrong shape — and reading it should not require the
    // platform's log viewer.
    expect(
      detailLine(
        violation([
          {
            code: "too_small",
            message: "Array must contain at least 8 element(s)",
            path: ["exemplars"],
          },
        ]),
      ),
    ).toBe("exemplars: Array must contain at least 8 element(s)");
  });

  test("a deep path is joined, and a rootless issue says so", () => {
    expect(
      detailLine(
        violation([
          { message: "Invalid uuid", path: ["fields", 3, "citationPassageId"] },
          { message: "Expected object", path: [] },
        ]),
      ),
    ).toBe("fields.3.citationPassageId: Invalid uuid; (root): Expected object");
  });

  test("beyond three, the count stands in for the rest", () => {
    // A model that returns the wrong shape returns it wrongly in one way
    // repeated; forty identical paths are no more diagnostic than three.
    const line = detailLine(
      violation(
        Array.from({ length: 12 }, (_, index) => ({
          message: "Invalid uuid",
          path: ["fields", index, "citationPassageId"],
        })),
      ),
    );
    expect(line?.endsWith("(+9 more)")).toBe(true);
    expect(line).toContain("fields.0.citationPassageId");
    expect(line).not.toContain("fields.3.");
  });

  test("an issue with no message is still located", () => {
    expect(detailLine(violation([{ path: ["fields"] }]))).toBe("fields");
  });
});

describe("what does not become a line", () => {
  test("a detail carrying neither a reason nor issues produces nothing", () => {
    expect(
      detailLine(
        new AuteurError("internal", "Failed.", {
          detail: { stageId: "draft" },
        }),
      ),
    ).toBeUndefined();
  });

  test("an empty issue list is not an empty line", () => {
    expect(
      detailLine(
        new AuteurError("internal", "Failed.", { detail: { issues: [] } }),
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
