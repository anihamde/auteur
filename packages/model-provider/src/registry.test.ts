import { describe, expect, test } from "bun:test";
import type { ModelDescriptor } from "./descriptor.ts";
import type { ModelProvider, ProviderEvent } from "./provider.ts";
import { createRegistry } from "./registry.ts";

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

const provider = (
  id: string,
  models: readonly ModelDescriptor[],
): ModelProvider => ({
  id,
  models: () => models,
  stream: (): AsyncIterable<ProviderEvent> => {
    throw new Error("not called");
  },
});

describe("a rejected registration changes nothing", () => {
  const cases: readonly [string, ModelDescriptor, string][] = [
    ["a blank id", model({ id: "  " }), "blank id"],
    [
      "a providerId that does not match its registrar",
      model({ providerId: "other" }),
      "names provider other",
    ],
    ["a blank displayName", model({ displayName: "" }), "blank displayName"],
    ["a blank creator", model({ creator: " " }), "blank creator"],
    [
      "a fractional contextWindow",
      model({ contextWindow: 1.5 }),
      "contextWindow",
    ],
    [
      "a zero maxOutputTokens",
      model({ maxOutputTokens: 0 }),
      "maxOutputTokens",
    ],
    [
      "an output ceiling above the whole window",
      model({ contextWindow: 8_000, maxOutputTokens: 9_000 }),
      "no room for the prompt",
    ],
    [
      "a zero input price",
      model({
        pricing: { inputPerMillion: 0, outputPerMillion: 10 },
      }),
      "non-positive price",
    ],
    [
      "a negative cached price",
      model({
        pricing: {
          cachedInputPerMillion: -1,
          inputPerMillion: 1,
          outputPerMillion: 10,
        },
      }),
      "negative cached input price",
    ],
  ];

  test.each(cases)("%s is refused", (_name, bad, fragment) => {
    const registry = createRegistry();
    expect(() => {
      registry.registerProvider(provider("router", [bad]));
    }).toThrow(fragment);
    // All-or-nothing: nothing was stored on the way to the throw.
    expect(registry.listModels()).toEqual([]);
  });

  test("a bad model in a batch rejects the whole provider", () => {
    const registry = createRegistry();
    expect(() => {
      registry.registerProvider(
        provider("router", [model(), model({ displayName: "", id: "bad" })]),
      );
    }).toThrow();
    expect(registry.listModels()).toEqual([]);
  });
});

describe("ids are unique across providers", () => {
  test("the same id twice in one provider is refused", () => {
    const registry = createRegistry();
    expect(() => {
      registry.registerProvider(provider("router", [model(), model()]));
    }).toThrow("already registered");
  });

  test("the same id from a second provider is refused", () => {
    const registry = createRegistry();
    registry.registerProvider(provider("router", [model()]));
    expect(() => {
      registry.registerProvider(
        provider("direct", [model({ providerId: "direct" })]),
      );
    }).toThrow("already registered");
  });
});

describe("exactly one model may be the default", () => {
  test("a second claim is refused and names the first", () => {
    const registry = createRegistry();
    expect(() => {
      registry.registerProvider(
        provider("router", [
          model({ default: true }),
          model({ default: true, id: "gpt-5-mini" }),
        ]),
      );
    }).toThrow("gpt-5 already does");
  });

  test("across providers too", () => {
    const registry = createRegistry();
    registry.registerProvider(provider("router", [model({ default: true })]));
    expect(() => {
      registry.registerProvider(
        provider("direct", [
          model({ default: true, id: "claude", providerId: "direct" }),
        ]),
      );
    }).toThrow("already does");
  });
});

describe("order is registration order, then declaration order", () => {
  test("the panel's rows do not move between renders", () => {
    const registry = createRegistry();
    registry.registerProvider(
      provider("router", [model({ id: "z-model" }), model({ id: "a-model" })]),
    );
    registry.registerProvider(
      provider("direct", [model({ id: "m-model", providerId: "direct" })]),
    );
    expect(registry.listModels().map((entry) => entry.id)).toEqual([
      "z-model",
      "a-model",
      "m-model",
    ]);
  });
});

describe("re-registering", () => {
  test("the same provider object is a no-op, so a repeated boot path is harmless", () => {
    const registry = createRegistry();
    const one = provider("router", [model()]);
    registry.registerProvider(one);
    registry.registerProvider(one);
    expect(registry.listModels()).toHaveLength(1);
  });

  test("a different object claiming the id is refused", () => {
    // It would silently decide which implementation `resolve` reaches.
    const registry = createRegistry();
    registry.registerProvider(provider("router", [model()]));
    expect(() => {
      registry.registerProvider(
        provider("router", [model({ id: "gpt-5-mini" })]),
      );
    }).toThrow("A different provider");
  });
});

describe("resolve", () => {
  test("an unknown id is model_unavailable, not invalid_input", () => {
    // The commonest way here is a stage_pins row naming a model the gateway
    // has since dropped — a 409 the panel can act on, not a 400 about a
    // malformed request.
    const registry = createRegistry();
    registry.registerProvider(provider("router", [model()]));
    try {
      registry.resolve("gone");
      throw new Error("should have thrown");
    } catch (thrown) {
      expect((thrown as { code?: string }).code).toBe("model_unavailable");
    }
  });

  test("the offending id goes in detail, not in the message", () => {
    const registry = createRegistry();
    try {
      registry.resolve("some-value-we-did-not-choose");
      throw new Error("should have thrown");
    } catch (thrown) {
      const error = thrown as { message: string; detail?: unknown };
      expect(error.message).not.toContain("some-value-we-did-not-choose");
      expect(error.detail).toEqual({ modelId: "some-value-we-did-not-choose" });
    }
  });

  test("find returns undefined where resolve throws", () => {
    const registry = createRegistry();
    expect(registry.find("gone")).toBeUndefined();
  });

  test("a resolved model carries the provider that owns it", () => {
    const registry = createRegistry();
    const one = provider("router", [model()]);
    registry.registerProvider(one);
    expect(registry.resolve("gpt-5").provider).toBe(one);
  });
});
