#!/usr/bin/env bun
/**
 * CI gate 5: dependency direction.
 *
 * Reads every workspace `package.json` — `packages/*` and `apps/*` — and
 * asserts, against `packages.manifest.ts`:
 *
 *   1. No package imports a package from a higher layer.
 *   2. No cycles exist in the workspace dependency graph.
 *   3. `@auteur/component-library` imports only tokens, icons, copy,
 *      formatting and core at runtime.
 *   4. No package imports an app.
 *   5. Every declared dependency is also in the manifest, and every manifest
 *      dependency is declared in `package.json`.
 *   6. Every non-workspace dependency uses `catalog:`; every workspace one
 *      uses `workspace:*`.
 *   7. Nothing exists on disk that the manifest does not declare.
 *
 * Rules 5, 6 and 7 apply to an app exactly as to a package. Rule 1 does not: an
 * app sits above every layer, so there is nothing above it to import. Apps are
 * left out of the cycle graph for the same reason — rule 4 already forbids
 * anything depending on an app.
 *
 * A package the manifest declares but nobody has materialized yet has no
 * `package.json` and is skipped. That is `docs/IMPLEMENTATION-PLAN.md`'s
 * declared-not-materialized rule, and it is what lets WP-A2 land the whole
 * manifest before WP-A5 generates the skeletons.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { APPS, LAYERS, PACKAGES } from "./packages.manifest.ts";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SCOPE = "@auteur/";

const COMPONENT_LIBRARY_ALLOWED = new Set([
  "copy",
  "core",
  "formatting",
  "icons",
  "tokens",
]);

/**
 * Layering governs the **runtime** graph. A test harness is not a runtime edge:
 * it never reaches a bundle, and forbidding it only makes packages duplicate
 * the harness rather than share it. So a `test`-layer package is permitted as a
 * devDependency from anywhere — including `component-library`, whose isolation
 * rule exists to keep it renderable without a store or an API client, not to
 * keep it from being tested.
 */
const testLayerPackages = new Set(
  PACKAGES.filter((spec) => spec.layer === "test").map((spec) => spec.name),
);

/**
 * Whether an edge is a test harness borrowed for tests only.
 *
 * **Both** the layering rule and the cycle rule ask this, and that is the
 * point: the exemption is meaningless if one rule waves the edge through and
 * the other counts it. A package that devDepends on a harness which depends
 * back on it has no runtime cycle, and reporting one sends the reader looking
 * for a problem that does not exist.
 */
const isDevOnlyTestHarness = (
  dep: string,
  runtime: readonly string[],
): boolean => testLayerPackages.has(dep) && !runtime.includes(dep);

const layerIndex = new Map(LAYERS.map((layer, index) => [layer, index]));
const specByName = new Map(PACKAGES.map((spec) => [spec.name, spec]));

type Failure = { readonly rule: string; readonly detail: string };

const failures: Failure[] = [];

const fail = (rule: string, detail: string): void => {
  failures.push({ detail, rule });
};

type Manifest = Record<string, unknown>;

/** `undefined` when the package is declared but not yet materialized. */
const readManifest = async (path: string): Promise<Manifest | undefined> => {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return undefined;
  }
  return (await file.json()) as Manifest;
};

const workspaceDepsIn = (
  manifest: Manifest,
  blocks: readonly string[],
): string[] => {
  const names = new Set<string>();
  for (const block of blocks) {
    const entries = manifest[block];
    if (entries === undefined) {
      continue;
    }
    for (const name of Object.keys(entries as Record<string, string>)) {
      if (name.startsWith(SCOPE)) {
        names.add(name.slice(SCOPE.length));
      }
    }
  }
  return [...names];
};

const allDeps = (manifest: Manifest): string[] =>
  workspaceDepsIn(manifest, [
    "dependencies",
    "devDependencies",
    "peerDependencies",
  ]);

const runtimeDeps = (manifest: Manifest): string[] =>
  workspaceDepsIn(manifest, ["dependencies", "peerDependencies"]);

const checkVersionSpecs = (label: string, manifest: Manifest): void => {
  for (const block of ["dependencies", "devDependencies"] as const) {
    const entries = (manifest[block] ?? {}) as Record<string, string>;
    for (const [name, spec] of Object.entries(entries)) {
      const expected = name.startsWith(SCOPE) ? "workspace:*" : "catalog:";
      if (spec !== expected) {
        fail(
          "version specs",
          `${label}: "${name}" is "${spec}", expected "${expected}". Third-party versions live in the root catalog.`,
        );
      }
    }
  }
};

const reconcile = (
  label: string,
  declared: readonly string[],
  expected: readonly string[],
): void => {
  const allowed = new Set(expected);
  for (const dep of declared) {
    if (!allowed.has(dep)) {
      fail(
        "manifest drift",
        `${label} depends on ${SCOPE}${dep}, which is not in its manifest entry. Add it to packages.manifest.ts (a reviewed change) or drop the dependency.`,
      );
    }
  }
  for (const dep of expected) {
    if (!declared.includes(dep)) {
      fail(
        "manifest drift",
        `packages.manifest.ts lists ${SCOPE}${dep} for ${label} but package.json does not. Run \`bun run new:package\`.`,
      );
    }
  }
};

const checkPackages = async (): Promise<Map<string, string[]>> => {
  const graph = new Map<string, string[]>();
  for (const spec of PACKAGES) {
    const label = `${SCOPE}${spec.name}`;
    const manifest = await readManifest(
      join(ROOT, "packages", spec.name, "package.json"),
    );
    if (manifest === undefined) {
      continue;
    }
    checkVersionSpecs(label, manifest);

    const declared = allDeps(manifest);
    const runtime = runtimeDeps(manifest);
    graph.set(
      spec.name,
      declared.filter((dep) => !isDevOnlyTestHarness(dep, runtime)),
    );

    reconcile(label, declared, [
      ...spec.workspaceDeps,
      ...(spec.workspaceDevDeps ?? []),
    ]);

    for (const dep of spec.workspaceDeps) {
      const depSpec = specByName.get(dep);
      if (depSpec === undefined) {
        fail("unknown package", `${label} depends on unknown ${SCOPE}${dep}.`);
        continue;
      }
      const from = layerIndex.get(spec.layer) ?? -1;
      const to = layerIndex.get(depSpec.layer) ?? -1;
      if (to > from && !isDevOnlyTestHarness(dep, runtime)) {
        fail(
          "layering",
          `${label} (${spec.layer}) depends on ${SCOPE}${dep} (${depSpec.layer}). Dependencies point down the layer stack, never up.`,
        );
      }
    }

    if (spec.name === "component-library") {
      // Runtime only. The rule keeps the library renderable without a store, a
      // service or the API client; a devDependency on a test harness does not
      // threaten that.
      for (const dep of runtime) {
        if (!COMPONENT_LIBRARY_ALLOWED.has(dep)) {
          fail(
            "component-library isolation",
            `${label} may import only ${[...COMPONENT_LIBRARY_ALLOWED].join(", ")} at runtime; found ${SCOPE}${dep}.`,
          );
        }
      }
    }
  }
  return graph;
};

const checkCycles = (graph: Map<string, string[]>): void => {
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (name: string): void => {
    const current = state.get(name);
    if (current === "done") {
      return;
    }
    if (current === "visiting") {
      const start = stack.indexOf(name);
      fail(
        "cycle",
        [...stack.slice(start), name].map((n) => `${SCOPE}${n}`).join(" -> "),
      );
      return;
    }
    state.set(name, "visiting");
    stack.push(name);
    for (const dep of graph.get(name) ?? []) {
      visit(dep);
    }
    stack.pop();
    state.set(name, "done");
  };
  for (const name of graph.keys()) {
    visit(name);
  }
};

const checkApps = async (): Promise<void> => {
  for (const spec of APPS) {
    const label = `${SCOPE}app-${spec.name}`;
    const manifest = await readManifest(
      join(ROOT, "apps", spec.name, "package.json"),
    );
    if (manifest === undefined) {
      continue;
    }
    checkVersionSpecs(label, manifest);
    reconcile(label, allDeps(manifest), [
      ...spec.workspaceDeps,
      ...(spec.workspaceDevDeps ?? []),
    ]);
    for (const dep of [
      ...spec.workspaceDeps,
      ...(spec.workspaceDevDeps ?? []),
    ]) {
      if (!specByName.has(dep)) {
        fail("unknown package", `${label} depends on unknown ${SCOPE}${dep}.`);
      }
    }
  }
};

const checkNoAppImports = async (): Promise<void> => {
  const appNames = new Set(APPS.map((app) => `${SCOPE}app-${app.name}`));
  for (const spec of PACKAGES) {
    const manifest = await readManifest(
      join(ROOT, "packages", spec.name, "package.json"),
    );
    if (manifest === undefined) {
      continue;
    }
    for (const block of ["dependencies", "devDependencies"] as const) {
      for (const name of Object.keys(
        (manifest[block] ?? {}) as Record<string, string>,
      )) {
        if (appNames.has(name)) {
          fail(
            "app import",
            `${SCOPE}${spec.name} depends on ${name}. Packages never import apps.`,
          );
        }
      }
    }
  }
};

const checkNoOrphans = async (): Promise<void> => {
  const appNames = new Set(APPS.map((app) => app.name));
  for (const [dir, known] of [
    ["packages", (name: string) => specByName.has(name)],
    ["apps", (name: string) => appNames.has(name)],
  ] as const) {
    const onDisk = await readdir(join(ROOT, dir)).catch(() => []);
    for (const name of onDisk) {
      if (!known(name)) {
        fail("orphan", `${dir}/${name} is not in packages.manifest.ts.`);
      }
    }
  }
};

const graph = await checkPackages();
checkCycles(graph);
await checkApps();
await checkNoAppImports();
await checkNoOrphans();

if (failures.length > 0) {
  const byRule = new Map<string, string[]>();
  for (const { detail, rule } of failures) {
    byRule.set(rule, [...(byRule.get(rule) ?? []), detail]);
  }
  for (const [rule, details] of byRule) {
    process.stderr.write(`\n${rule}:\n`);
    for (const detail of details) {
      process.stderr.write(`  - ${detail}\n`);
    }
  }
  process.stderr.write(
    `\n${failures.length.toString()} dependency violation(s)\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `dependency direction ok: ${graph.size.toString()} of ${PACKAGES.length.toString()} packages materialized, 0 cycles, 0 upward imports\n`,
);
