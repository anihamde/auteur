#!/usr/bin/env bun
/**
 * Gate 16 — nothing on the serverless path uses a Bun-only global.
 *
 * The functions under `apps/auteur-web/api/` run on **Node**, not Bun. Bun is
 * the toolchain — the test runner, the scripts, the local dev server — and
 * that is exactly what makes this hard to notice: `Bun.CryptoHasher`,
 * `Bun.hash`, `Bun.env` and `Bun.sleep` all work in every test and every local
 * run, and are `Bun is not defined` on the first request of every deployment.
 *
 * There is no local symptom. `turbo test` is green, `turbo build` is green, and
 * the deploy answers 500 to everything. That is why this is a gate rather than
 * a note: it is a whole-class defect whose only other detector is production.
 *
 * The check walks the import graph from the function entry points rather than
 * scanning `packages/` wholesale — a Bun global in a script or a test is
 * correct, and a rule that forbade it everywhere would be a rule people turn
 * off.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { PACKAGES } from "./packages.manifest.ts";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const API = join(ROOT, "apps/auteur-web/api");

/** The globals Bun provides and Node does not. */
const BUN_ONLY = /\bBun\.\w+/g;

/** Where a workspace import resolves to on disk. */
export const workspaceEntry = (specifier: string): string | undefined => {
  const match = /^@auteur\/([\w-]+)(?:\/([\w-]+))?$/.exec(specifier);
  if (match === null) return undefined;
  const name = match[1];
  if (name === undefined) return undefined;
  const spec = PACKAGES.find((candidate) => candidate.name === name);
  if (spec === undefined) return undefined;
  const exportName = match[2] ?? name;
  const target = spec.exports[exportName];
  return target === undefined
    ? undefined
    : join(ROOT, "packages", name, target);
};

const IMPORT = /(?:^|\n)\s*(?:import|export)[^"']*from\s*["']([^"']+)["']/g;

/** Every module specifier `source` imports or re-exports from. */
export const importsOf = (source: string): string[] =>
  [...source.matchAll(IMPORT)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => specifier !== undefined);

export const reachableFrom = (entries: readonly string[]): Set<string> => {
  const seen = new Set<string>();
  const queue = [...entries];

  for (const entry of entries) {
    // Without this the check passes vacuously the day an entry point is
    // renamed: an unreadable file is skipped, the graph is empty, and a gate
    // that scans nothing reports success.
    if (!existsSync(entry)) {
      throw new Error(`entry point does not exist: ${entry}`);
    }
  }

  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    seen.add(file);

    for (const specifier of importsOf(source)) {
      if (specifier.startsWith(".")) {
        queue.push(resolve(dirname(file), specifier));
        continue;
      }
      const entry = workspaceEntry(specifier);
      if (entry !== undefined) queue.push(entry);
    }
  }
  return seen;
};

/**
 * The Bun globals in one file's source, as `line:global` pairs.
 *
 * Separate from `findings` so the rule can be exercised on a fixture rather
 * than on whatever happens to be on disk.
 */
export const findingsIn = (
  source: string,
): { global: string; line: number }[] =>
  source.split("\n").flatMap((line, index) => {
    // A comment may name the global it is explaining not to use.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return [];
    const hit = BUN_ONLY.exec(line);
    BUN_ONLY.lastIndex = 0;
    return hit === null ? [] : [{ global: hit[0], line: index + 1 }];
  });

export const findings = (files: Iterable<string>): string[] => {
  const found: string[] = [];
  for (const file of files) {
    if (/\.test\.tsx?$/.test(file)) continue;
    for (const hit of findingsIn(readFileSync(file, "utf8"))) {
      found.push(
        `${file.replace(`${ROOT}/`, "")}:${hit.line.toString()} ${hit.global}`,
      );
    }
  }
  return found.sort();
};

/**
 * Every function entry point.
 *
 * `api/[[...path]].ts` at the repository root is the file the platform turns
 * into a function; it re-exports the app's own catch-all, which is where the
 * graph really starts. `_app.ts` is listed too because it is the module every
 * route test mounts, and a Bun global reachable only through it would be a
 * defect the tests share with the deployment.
 */
export const ENTRIES = [
  join(ROOT, "api/[[...path]].ts"),
  join(API, "[[...path]].ts"),
  join(API, "_app.ts"),
];

if (import.meta.main) {
  const reached = reachableFrom(ENTRIES);
  const problems = findings(reached);
  if (problems.length > 0) {
    process.stderr.write(
      `${problems.length.toString()} Bun-only global(s) on the serverless path:\n` +
        `${problems.map((line) => `  - ${line}`).join("\n")}\n\n` +
        "These functions run on Node. A Bun global here works in every test and\n" +
        "every local run, and is `Bun is not defined` on the first request of\n" +
        "the deployment. Use `node:crypto`, `process.env` or `setTimeout`.\n",
    );
    process.exit(1);
  }
  process.stdout.write(
    `no Bun-only globals on the serverless path: ${reached.size.toString()} modules reachable from ${ENTRIES.length.toString()} entry points\n`,
  );
}
