import { describe, expect, test } from "bun:test";
import { APPS, LAYERS, type Layer, PACKAGES } from "./packages.manifest.ts";

/**
 * These tests hold the manifest against `docs/ARCHITECTURE.md` §1 and against
 * the invariants `check-dependencies.ts` will enforce once it exists. They run
 * before any package is materialized, which is the point: the manifest is the
 * contract every later work package is written against.
 */

/** Every package `ARCHITECTURE.md` §1 names, grouped as it groups them. */
const ARCHITECTURE_PACKAGES: Readonly<Record<Layer, readonly string[]>> = {
  agent: ["model-provider", "provider-router", "prompt", "pipeline"],
  api: ["api-contract", "api-client", "stream-client"],
  app: [],
  foundation: [
    "ids",
    "core",
    "errors",
    "env",
    "logger",
    "text",
    "prosody",
    "tokens",
    "icons",
    "copy",
    "formatting",
    // Added by the plan: §6.3 calls tiers.ts data rather than engine.
    "config",
  ],
  infra: ["db", "migrations"],
  service: ["corpus-gutenberg", "style-card", "style-fit", "export"],
  store: [
    "session-store",
    "card-store",
    "corpus-store",
    "event-store",
    // Added by the plan: the durable stage chain of §5.3.
    "stage-queue",
  ],
  test: [
    "test-support",
    "provenance-suite",
    // Added by the plan: Postgres means a real database in every store test.
    "test-db",
  ],
  tooling: [
    "tsconfig",
    "biome-config",
    // Added by the plan: gate 9's implementation, taken from argo-browser.
    "dependency-min-age",
  ],
  ui: ["component-library"],
};

const byName = new Map(PACKAGES.map((spec) => [spec.name, spec]));
const layerIndex = new Map(LAYERS.map((layer, index) => [layer, index]));

const indexOfLayer = (layer: Layer): number => {
  const index = layerIndex.get(layer);
  if (index === undefined) {
    throw new Error(`layer not in LAYERS: ${layer}`);
  }
  return index;
};

describe("the manifest covers ARCHITECTURE.md §1", () => {
  test("LAYERS is §1's order, plus app for the deployable unit", () => {
    expect(LAYERS).toEqual([
      "foundation",
      "infra",
      "store",
      "service",
      "agent",
      "api",
      "ui",
      "test",
      "tooling",
      "app",
    ]);
  });

  test.each(
    Object.entries(ARCHITECTURE_PACKAGES).flatMap(([layer, names]) =>
      names.map((name) => [name, layer] as const),
    ),
  )("%s is declared, in layer %s", (name, layer) => {
    const spec = byName.get(name);
    expect(spec).toBeDefined();
    expect(spec?.layer).toBe(layer as Layer);
  });

  test("declares nothing §1 does not name", () => {
    const expected = new Set(Object.values(ARCHITECTURE_PACKAGES).flat());
    const extra = PACKAGES.filter((spec) => !expected.has(spec.name));
    expect(extra.map((spec) => spec.name)).toEqual([]);
  });

  test("one app, and it is the whole deploy", () => {
    expect(APPS.map((app) => app.name)).toEqual(["auteur-web"]);
  });
});

describe("the invariants the dependency gate will enforce", () => {
  test("every name is unique", () => {
    expect(byName.size).toBe(PACKAGES.length);
  });

  test.each(PACKAGES.map((spec) => [spec.name, spec] as const))(
    "%s depends only on packages that exist",
    (_name, spec) => {
      const missing = [
        ...spec.workspaceDeps,
        ...(spec.workspaceDevDeps ?? []),
      ].filter((dep) => !byName.has(dep));
      expect(missing).toEqual([]);
    },
  );

  test.each(PACKAGES.map((spec) => [spec.name, spec] as const))(
    "%s depends only on its own layer or below",
    (_name, spec) => {
      const own = indexOfLayer(spec.layer);
      const above = spec.workspaceDeps.filter(
        (dep) => indexOfLayer(byName.get(dep)?.layer ?? spec.layer) > own,
      );
      expect(above).toEqual([]);
    },
  );

  test("the dependency graph has no cycle", () => {
    const state = new Map<string, "visiting" | "done">();
    const walk = (name: string, path: readonly string[]): void => {
      if (state.get(name) === "done") {
        return;
      }
      if (state.get(name) === "visiting") {
        throw new Error(`cycle: ${[...path, name].join(" -> ")}`);
      }
      state.set(name, "visiting");
      for (const dep of byName.get(name)?.workspaceDeps ?? []) {
        walk(dep, [...path, name]);
      }
      state.set(name, "done");
    };
    expect(() => {
      for (const spec of PACKAGES) {
        walk(spec.name, []);
      }
    }).not.toThrow();
  });

  test("component-library reaches exactly its five, and no further", () => {
    expect(
      [...(byName.get("component-library")?.workspaceDeps ?? [])].sort(),
    ).toEqual(["copy", "core", "formatting", "icons", "tokens"]);
  });

  test("no package outside the store and test layers imports db directly", () => {
    const allowed = new Set(["migrations", "test-db"]);
    const offenders = PACKAGES.filter(
      (spec) =>
        spec.workspaceDeps.includes("db") &&
        spec.layer !== "store" &&
        !allowed.has(spec.name),
    );
    expect(offenders.map((spec) => spec.name)).toEqual([]);
  });
});

describe("exports", () => {
  test.each(
    PACKAGES.filter((spec) => Object.keys(spec.exports).length > 0).map(
      (spec) => [spec.name, spec] as const,
    ),
  )("%s's export paths are all under src/", (_name, spec) => {
    const stray = Object.values(spec.exports).filter(
      (path) => !path.startsWith("./src/"),
    );
    expect(stray).toEqual([]);
  });

  test("only the two config packages export nothing", () => {
    const empty = PACKAGES.filter(
      (spec) => Object.keys(spec.exports).length === 0,
    );
    expect(empty.map((spec) => spec.name).sort()).toEqual([
      "biome-config",
      "tsconfig",
    ]);
  });

  test("the packages the plan calls load-bearing carry a 0.9 floor", () => {
    const raised = PACKAGES.filter((spec) => spec.coverage === 0.9);
    expect(raised.map((spec) => spec.name).sort()).toEqual([
      "event-store",
      "migrations",
      "pipeline",
      "prosody",
      "provider-router",
      "stage-queue",
      "stream-client",
      "style-card",
      "style-fit",
      "text",
    ]);
  });
});
