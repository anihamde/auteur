import { describe, expect, test } from "bun:test";
import { createRegistry } from "@auteur/model-provider/registry";
import {
  CATALOGUE,
  findRow,
  ROUTER_PROVIDER_ID,
  toDescriptor,
} from "./models.ts";

describe("no row is measured yet", () => {
  test("every row is tagged declared, and this test is deleted by WP-X0", () => {
    // What stops a declared table from being quietly mistaken for a verified
    // one. `structuredOutput` and `maxOutputTokens` came from published
    // documentation, not from asking the gateway; the verification pass
    // re-tags a row only after measuring it, and fails if the measurement
    // differs from the declaration.
    const measured = CATALOGUE.filter((row) => row.source === "measured");
    expect(measured.map((row) => row.id)).toEqual([]);
  });
});

describe("every row is usable", () => {
  test.each(CATALOGUE.map((row) => [row.id, row] as const))(
    "%s",
    (_id, row) => {
      expect(row.pricing.inputPerMillion).toBeGreaterThan(0);
      expect(row.pricing.outputPerMillion).toBeGreaterThan(0);
      expect(row.maxOutputTokens).toBeGreaterThan(0);
      expect(row.maxOutputTokens).toBeLessThanOrEqual(row.contextWindow);
      expect(typeof row.structuredOutput).toBe("boolean");
    },
  );

  test("ids are unique", () => {
    expect(new Set(CATALOGUE.map((row) => row.id)).size).toBe(CATALOGUE.length);
  });

  test("the whole catalogue registers, which is the only check that runs them all", () => {
    // The registry's validation is per-row and specific — a zero price, an
    // output ceiling above the window, a duplicate id. Registering the real
    // table is how a bad row is caught by the message that names it rather
    // than by a tier failing to resolve later.
    const registry = createRegistry();
    registry.registerProvider({
      id: ROUTER_PROVIDER_ID,
      models: () => CATALOGUE.map((row) => toDescriptor(row)),
      stream: () => {
        throw new Error("not called");
      },
    });
    expect(registry.listModels()).toHaveLength(CATALOGUE.length);
  });

  test("exactly one row is the default", () => {
    expect(CATALOGUE.filter((row) => row.default === true)).toHaveLength(1);
  });

  test("a cached rate, where one is declared, is below the fresh rate", () => {
    // A cache read that cost more than a fresh token would be a discount
    // nobody would take, and is the shape a transposed pair of columns makes.
    for (const row of CATALOGUE) {
      if (row.pricing.cachedInputPerMillion === undefined) continue;
      expect(row.pricing.cachedInputPerMillion).toBeLessThan(
        row.pricing.inputPerMillion,
      );
    }
  });
});

describe("the catalogue's order is the panel's order", () => {
  test("nothing sorts it at run time", () => {
    const descriptors = CATALOGUE.map((row) => toDescriptor(row));
    expect(descriptors.map((model) => model.id)).toEqual(
      CATALOGUE.map((row) => row.id),
    );
  });
});

describe("findRow", () => {
  test("an unknown id is undefined rather than a throw", () => {
    expect(findRow("no-such-model")).toBeUndefined();
  });

  test("a known id round-trips through toDescriptor", () => {
    const row = CATALOGUE[0];
    if (row === undefined) throw new Error("empty catalogue");
    expect(toDescriptor(row).id).toBe(row.id);
    expect(findRow(row.id)).toBe(row);
  });
});
