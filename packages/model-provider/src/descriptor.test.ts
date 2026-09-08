import { describe, expect, test } from "bun:test";
import type { ModelDescriptor } from "./descriptor.ts";
import { meetsRequirements } from "./descriptor.ts";
import type { ResponseFormat } from "./request.ts";

const model = (overrides: Partial<ModelDescriptor> = {}): ModelDescriptor => ({
  contextWindow: 200_000,
  creator: "OpenAI",
  displayName: "GPT-5",
  id: "gpt-5",
  maxOutputTokens: 32_000,
  pricing: { inputPerMillion: 1_250_000, outputPerMillion: 10_000_000 },
  providerId: "router",
  structuredOutput: true,
  ...overrides,
});

describe("eligibility is one function, not three", () => {
  test("a typed stage refuses a model that cannot emit a strict schema", () => {
    // Six of the seven model stages are typed. The tier map and a session pin
    // must reach the same answer, or pinning a model that cannot emit
    // json_schema is accepted and then failed on mid-session.
    const verdict = meetsRequirements(
      model({ displayName: "Legacy", structuredOutput: false }),
      { structuredOutput: true },
    );
    expect(verdict.eligible).toBe(false);
    if (verdict.eligible) return;
    expect(verdict.reason).toContain("Legacy");
    expect(verdict.reason).toContain("strict json_schema");
  });

  test("an untyped stage accepts it", () => {
    expect(
      meetsRequirements(model({ structuredOutput: false }), {}).eligible,
    ).toBe(true);
  });

  test("a single-call draft refuses a model whose ceiling is too low", () => {
    // The failure this catches does not look like a failure: a model that runs
    // out of output tokens returns a truncated story every layer above reports
    // as complete.
    const verdict = meetsRequirements(model({ maxOutputTokens: 8_000 }), {
      minOutputTokens: 30_000,
    });
    expect(verdict.eligible).toBe(false);
    if (verdict.eligible) return;
    expect(verdict.reason).toContain("8,000");
    expect(verdict.reason).toContain("30,000");
  });

  test("exactly enough output tokens is enough", () => {
    expect(
      meetsRequirements(model({ maxOutputTokens: 30_000 }), {
        minOutputTokens: 30_000,
      }).eligible,
    ).toBe(true);
  });

  test("both requirements must hold, not either", () => {
    expect(
      meetsRequirements(
        model({ maxOutputTokens: 8_000, structuredOutput: true }),
        { minOutputTokens: 30_000, structuredOutput: true },
      ).eligible,
    ).toBe(false);
  });
});

describe("strict is the literal true", () => {
  test("a non-strict format does not type-check", () => {
    // A non-strict schema is a suggestion the model may ignore. If `strict`
    // were `boolean`, every stage's output contract could be turned off one
    // call site at a time.
    const good: ResponseFormat = {
      name: "outline",
      schema: { type: "object" },
      strict: true,
    };
    expect(good.strict).toBe(true);

    const bad: ResponseFormat = {
      name: "outline",
      schema: { type: "object" },
      // @ts-expect-error strict may only be the literal `true`
      strict: false,
    };
    expect(bad.name).toBe("outline");
  });
});
