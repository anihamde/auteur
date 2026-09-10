#!/usr/bin/env bun
import { existsSync } from "node:fs";
/**
 * Materializes package skeletons from `packages.manifest.ts`.
 *
 * `bun run new:package` regenerates every workspace's `package.json`,
 * `tsconfig.json` and README stub from the manifest, and creates a placeholder
 * source file for any declared export that does not exist yet. Source files
 * that already exist are never touched, so it is safe to re-run after the
 * manifest grows a new export.
 *
 * ## `--check`
 *
 * Regenerates the same files **in memory** and fails on any difference. This is
 * the gate that makes the manifest the source of truth rather than a document
 * describing what the tree used to be, and it is not decoration: three of the
 * generated files are themselves CI gates.
 *
 *  - `bunfig.toml` carries the coverage floor gate 3 enforces *and*
 *    `coveragePathIgnorePatterns`. Edited on disk, a package can set its floor
 *    to zero and exclude its own `src/**` from measurement while the manifest
 *    still says `coverage: 0.9`, and every gate stays green. It also carries
 *    `testPreload`, which decides whether a package gets a DOM harness at all.
 *  - `tsconfig.json` decides what gate 2 type-checks, `include` most of all.
 *  - `package.json` carries the `exports` map that gate 4 snapshots and gate 5
 *    reconciles, and the `test:*` scripts every other gate runs through.
 *
 * The comparison runs against what a regenerate would write, which is why
 * `syncPackage` and this share one renderer rather than two that agree today.
 * Same shape as gate 4: generate, compare, name the file.
 *
 * JSON is compared as *content*, not as bytes: `syncPackage` writes a plain
 * serialization and biome then rewrites it — collapsing short arrays onto one
 * line, and reordering keys, since `biome.json` turns `useSortedKeys` on — so
 * the bytes on disk are never the bytes the generator emitted. Both sides are
 * therefore parsed and re-serialized with their keys sorted. Whitespace and key
 * order are what that drops, and both belong to gate 1; every value, every key
 * name, and every added or missing entry still fails here. `bunfig.toml` is not
 * JSON and biome does not touch it, so it is compared byte for byte.
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AppSpec, PackageSpec } from "./packages.manifest.ts";
import { APPS, PACKAGES } from "./packages.manifest.ts";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

const SHARED_DEV_DEPS = ["@types/bun", "typescript"] as const;

/**
 * Packages the generator neither writes nor checks.
 *
 * `PackageSpec.handWritten` says why: the two config packages ship JSON every
 * other package extends and have none of the generated shape.
 */
const isHandWritten = (spec: PackageSpec): boolean => spec.handWritten === true;

const catalogEntries = (names: readonly string[]): Record<string, string> =>
  Object.fromEntries([...names].sort().map((name) => [name, "catalog:"]));

const workspaceEntries = (names: readonly string[]): Record<string, string> =>
  Object.fromEntries(
    [...names].sort().map((name) => [`@auteur/${name}`, "workspace:*"]),
  );

const sortObject = <T>(value: Record<string, T>): Record<string, T> =>
  Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)),
  );

/**
 * The bytes a generated JSON file gets on disk.
 *
 * One serializer for both writing and checking: biome reformats the result
 * afterwards, and `--check` compares content rather than bytes for exactly that
 * reason, but the *content* has to come from a single place or the two drift.
 */
const jsonText = (value: unknown): string =>
  `${JSON.stringify(value, undefined, 2)}\n`;

/** Generated file contents, keyed by path relative to the package directory. */
type Generated = Readonly<Record<string, string>>;

const packageJsonFor = (spec: PackageSpec): unknown => {
  const scripts: Record<string, string> = {
    "test:coverage": "bun ../../scripts/package-tests.ts coverage",
    "test:types": "tsc --noEmit",
    "test:unit": "bun ../../scripts/package-tests.ts unit",
  };
  if (spec.build !== undefined) {
    scripts["build"] = spec.build;
  }
  for (const [name, command] of Object.entries(spec.scripts ?? {})) {
    scripts[name] = command;
  }
  return {
    dependencies: sortObject({
      ...workspaceEntries(spec.workspaceDeps),
      ...catalogEntries(spec.deps),
    }),
    devDependencies: sortObject({
      ...catalogEntries([...SHARED_DEV_DEPS, ...spec.devDeps]),
      ...workspaceEntries(spec.workspaceDevDeps ?? []),
    }),
    exports: sortObject(
      Object.fromEntries(
        Object.entries(spec.exports).map(([subpath, file]) => [
          `./${subpath}`,
          file,
        ]),
      ),
    ),
    files: ["src/**/*"],
    name: `@auteur/${spec.name}`,
    private: true,
    scripts: sortObject(scripts),
    type: "module",
    version: "0.0.0",
  };
};

const tsconfigFor = (spec: PackageSpec): unknown => ({
  compilerOptions: {
    lib:
      spec.react === true
        ? ["esnext", "dom", "dom.iterable"]
        : ["esnext", "dom"],
    module: "esnext",
    moduleResolution: "bundler",
    types: ["bun"],
  },
  // By relative path rather than by package name. `@auteur/tsconfig` is a
  // workspace package, so naming it here would put it in every package's
  // devDependencies and therefore in every manifest entry — 35 identical lines
  // saying the same thing, and a dependency-gate edge that is not a real
  // import. Packages are siblings, so the path is stable.
  extends: `../tsconfig/${spec.react === true ? "react" : "base"}.json`,
  // `tests` is included so integration suites are type-checked by `test:types`
  // rather than only failing at run time. A package without the directory
  // simply matches no files there.
  include: ["src", "tests"],
});

const readmeFor = (spec: PackageSpec): string => {
  const deps = [
    ...spec.workspaceDeps.map((d) => `\`@auteur/${d}\``),
    ...spec.deps.map((d) => `\`${d}\``),
  ];
  return [
    `# @auteur/${spec.name}`,
    "",
    spec.description,
    "",
    `Layer: \`${spec.layer}\`. It may import packages in its own layer or below, never above.`,
    "",
    "## Dependencies",
    "",
    deps.length > 0 ? deps.join(", ") : "None.",
    "",
    "## Public surface",
    "",
    "See `api-surface.md`, which CI regenerates and compares on every pull request.",
    "",
    "## Testing",
    "",
    "```sh",
    "bun run turbo test --filter @auteur/" + spec.name,
    "```",
    "",
  ].join("\n");
};

/**
 * The source files a skeleton needs to exist.
 *
 * Every declared export, plus the entrypoint of a declared `build` command. The
 * build script is not an export — nobody imports `build-manifest.ts` — but
 * `turbo build` runs it before anything else in the graph, so a package that
 * declares a build and has no script to run fails the whole workspace at the
 * root of the dependency tree rather than in its own tests. `@auteur/migrations`
 * is the one such package today and found this on WP-A5's first run.
 */
const placeholderTargets = (spec: PackageSpec): readonly string[] => {
  const targets = new Set(Object.values(spec.exports));
  const entry = /(\.\/)?(src\/[\w./-]+\.tsx?)/.exec(spec.build ?? "")?.[2];
  if (entry !== undefined) {
    targets.add(`./${entry}`);
  }
  return [...targets];
};

const placeholderFor = (file: string): string => {
  const name = file.replace(/^\.\/src\//, "").replace(/\.tsx?$/, "");
  return [
    "// Placeholder generated by `bun run new:package`. The work package that owns",
    `// this module replaces it with the real implementation of \`${name}\`.`,
    "",
    `export const unimplemented = (): never => {`,
    `  throw new Error("unimplemented: ${name}");`,
    "};",
    "",
  ].join("\n");
};

/**
 * The `preload` line, or nothing when the workspace declares no harness.
 *
 * Shared by the package and the app renderers so a preload means the same thing
 * in both files, which is the whole reason `testPreload` exists on `AppSpec`.
 */
const preloadLines = (
  testPreload: readonly string[] | undefined,
): readonly string[] =>
  testPreload === undefined
    ? []
    : [`preload = [${testPreload.map((module) => `"${module}"`).join(", ")}]`];

/**
 * Bun reads `bunfig.toml` from the working directory, so the coverage floor
 * from the manifest is enforced by `bun test --coverage` inside the package.
 */
const bunfigFor = (spec: PackageSpec): string => {
  const floor = spec.coverage ?? 0.8;
  const preload = preloadLines(spec.testPreload);
  return [
    "# Generated by `bun run new:package` from scripts/packages.manifest.ts.",
    "# The floor is part of gate 3: see docs/IMPLEMENTATION-PLAN.md §2.2.",
    "[test]",
    ...preload,
    "coverageSkipTestFiles = true",
    "# Count only this package's own sources. Without this, bun attributes",
    "# imported workspace files to the importing package, and a dependency's",
    "# unused exports drag the floor down where they are already covered.",
    "# `tests/**` holds harnesses and fixtures, not product code: they run, but",
    "# they are not what the floor is measuring.",
    'coveragePathIgnorePatterns = ["../**", "tests/**"]',
    `coverageThreshold = { line = ${floor.toString()}, function = ${floor.toString()} }`,
    "",
  ].join("\n");
};

/**
 * The three files the manifest owns outright.
 *
 * `README.md` is not here: it is a stub the owning package is expected to
 * replace, and a generated file nobody may edit is a different thing from a
 * starting point. The placeholder sources are not here either, for the same
 * reason — they exist to be overwritten.
 */
const generatedPackageFiles = (spec: PackageSpec): Generated => ({
  "bunfig.toml": bunfigFor(spec),
  "package.json": jsonText(packageJsonFor(spec)),
  "tsconfig.json": jsonText(tsconfigFor(spec)),
});

const syncPackage = async (spec: PackageSpec): Promise<void> => {
  const dir = join(ROOT, "packages", spec.name);
  for (const [file, content] of Object.entries(generatedPackageFiles(spec))) {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, file), content);
  }
  if (!existsSync(join(dir, "README.md"))) {
    await writeFile(join(dir, "README.md"), readmeFor(spec));
  }
  for (const file of placeholderTargets(spec)) {
    const path = join(dir, file);
    if (!existsSync(path)) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, placeholderFor(file));
    }
  }
};

type GeneratedPackageJson = {
  readonly dependencies: Record<string, string>;
  readonly devDependencies: Record<string, string>;
  readonly scripts: Record<string, string>;
};

const appPackageJson = (
  spec: AppSpec,
): GeneratedPackageJson & Record<string, unknown> => ({
  dependencies: sortObject({
    ...workspaceEntries(spec.workspaceDeps),
    ...catalogEntries(spec.deps),
  }),
  devDependencies: sortObject({
    ...catalogEntries([...SHARED_DEV_DEPS, ...spec.devDeps]),
    ...workspaceEntries(spec.workspaceDevDeps ?? []),
  }),
  name: `@auteur/app-${spec.name}`,
  private: true,
  scripts: sortObject({ ...spec.scripts }),
  type: "module",
  version: "0.0.0",
});

/**
 * What a regenerate would leave in `apps/<name>/package.json`.
 *
 * The manifest owns the dependency blocks and every script it names. Any other
 * key an app has added is left alone, so a regenerate refreshes the managed
 * parts without flattening the rest — which means the expected content depends
 * on what is on disk, and has to be computed from it rather than from the
 * manifest alone.
 */
const generatedAppFiles = async (spec: AppSpec): Promise<Generated> => {
  const bunfig = appBunfig(spec);
  const extra = bunfig === undefined ? {} : { "bunfig.toml": bunfig };
  const tsconfig = { "tsconfig.json": jsonText(appTsconfig()) };
  const path = join(ROOT, "apps", spec.name, "package.json");
  if (!existsSync(path)) {
    return {
      ...extra,
      ...tsconfig,
      "package.json": jsonText(appPackageJson(spec)),
    };
  }
  const current = (await Bun.file(path).json()) as Record<string, unknown>;
  const { dependencies, devDependencies, scripts } = appPackageJson(spec);
  const existing: Record<string, string> =
    typeof current["scripts"] === "object" && current["scripts"] !== null
      ? (current["scripts"] as Record<string, string>)
      : {};
  return {
    ...extra,
    ...tsconfig,
    "package.json": jsonText({
      ...current,
      dependencies,
      devDependencies,
      scripts: sortObject({ ...existing, ...scripts }),
    }),
  };
};

/**
 * An app's `bunfig.toml`: the preload and nothing else.
 *
 * `apps/web` renders React, and happy-dom has to be registered before
 * `@testing-library/react` is evaluated — which bun can only do from a
 * `bunfig.toml` in the app's own directory. Without one the app reaches the
 * harness by relative path out of the workspace, which is the undeclared
 * cross-package import the dependency gate exists to forbid; the manifest
 * simply had no way to say what was needed.
 *
 * Deliberately no `coverageThreshold` and no `coveragePathIgnorePatterns`: gate
 * 7 sets no floor on `apps/`, an `AppSpec` has no `coverage` field to read one
 * from, and a floor an app was never measured against would be a number nobody
 * chose. An app that declares no preload gets no file at all rather than an
 * empty one.
 */
const appBunfig = (spec: AppSpec): string | undefined => {
  const preload = preloadLines(spec.testPreload);
  if (preload.length === 0) {
    return undefined;
  }
  return [
    "# Generated by `bun run new:package` from scripts/packages.manifest.ts.",
    "# An app carries no coverage floor: the floors measure packages/ only.",
    "[test]",
    ...preload,
    "",
  ].join("\n");
};

/**
 * An app's `tsconfig.json`.
 *
 * Without one, `tsc --noEmit` in an app directory falls back to compiler
 * defaults — no `strict`, no `noUncheckedIndexedAccess`, none of what
 * `packages/tsconfig` exists to set — and gate 2 passes an app it never really
 * checked. Found on WP-A5's first run, when the app type-checked green with no
 * config at all.
 *
 * `include` named `api` until the routes moved to `server/`, and a directory
 * that does not exist is not an error — so for four work packages the routes
 * were compiled only where a test happened to import them, and `entry.ts`,
 * which nothing imports, was compiled nowhere. It lost a function to a refactor
 * and kept the call to it: every stage invocation on the deployment threw
 * `selfOrigin is not defined` into a `void`ed promise. This list is what
 * decides whether the deployed code is type-checked at all.
 */
const appTsconfig = (): unknown => ({
  compilerOptions: {
    lib: ["esnext", "dom", "dom.iterable"],
    module: "esnext",
    moduleResolution: "bundler",
    types: ["bun"],
  },
  extends: "../../packages/tsconfig/react.json",
  include: ["server", "src", "tests"],
});

const syncApp = async (spec: AppSpec): Promise<void> => {
  const dir = join(ROOT, "apps", spec.name);
  const files = await generatedAppFiles(spec);
  for (const [file, content] of Object.entries(files)) {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, file), content);
  }
  // One placeholder source, for the same reason a package gets them: `tsc`
  // fails with TS18003 when `include` matches nothing, so a skeleton app with
  // no sources reddens gate 2 for having nothing in it. The work package that
  // builds the app replaces this.
  const entry = join(dir, "src", "main.ts");
  if (!existsSync(entry)) {
    await mkdir(dirname(entry), { recursive: true });
    await writeFile(entry, placeholderFor("./src/main.ts"));
  }
  if (!("bunfig.toml" in files)) {
    await rm(join(dir, "bunfig.toml"), { force: true });
  }
};

/**
 * Every generated file whose bytes on disk differ from what the manifest says
 * they should be, as a sentence each.
 */
/** A JSON value with every object's keys in sorted order, at every depth. */
const sortDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (typeof value === "object" && value !== null) {
    return sortObject(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, sortDeep(entry)]),
      ),
    );
  }
  return value;
};

/**
 * The comparable form of a generated file: JSON with its formatting and key
 * order dropped, anything else exactly as written.
 *
 * A file that is named `.json` and does not parse is left as text, so a
 * corrupted `package.json` fails the comparison rather than crashing the gate.
 */
const canonical = (relative: string, text: string): string => {
  if (!relative.endsWith(".json")) {
    return text;
  }
  try {
    return JSON.stringify(sortDeep(JSON.parse(text)));
  } catch {
    return text;
  }
};

const drift = async (): Promise<readonly string[]> => {
  const found: string[] = [];
  const compare = async (
    dir: string,
    relative: string,
    expected: string,
  ): Promise<void> => {
    const path = join(dir, relative);
    if (!existsSync(path)) {
      found.push(`${relative} is missing from ${dir.slice(ROOT.length + 1)}`);
      return;
    }
    const actual = await Bun.file(path).text();
    if (canonical(relative, actual) !== canonical(relative, expected)) {
      found.push(
        `${join(dir.slice(ROOT.length + 1), relative)} does not match what scripts/packages.manifest.ts generates`,
      );
    }
  };

  for (const spec of PACKAGES) {
    if (isHandWritten(spec)) {
      continue;
    }
    // A package the manifest declares but nobody has materialized yet has no
    // directory. That is the declared-not-materialized rule gates 4 and 5 also
    // follow: A2 lands the whole manifest, A5 generates the skeletons.
    const dir = join(ROOT, "packages", spec.name);
    if (!existsSync(dir)) {
      continue;
    }
    for (const [file, content] of Object.entries(generatedPackageFiles(spec))) {
      await compare(dir, file, content);
    }
  }
  for (const spec of APPS) {
    const dir = join(ROOT, "apps", spec.name);
    if (!existsSync(dir)) {
      continue;
    }
    const files = await generatedAppFiles(spec);
    for (const [file, content] of Object.entries(files)) {
      await compare(dir, file, content);
    }
    // An app that stops declaring a preload must stop having a bunfig.toml.
    // A leftover one keeps preloading a harness the manifest no longer names,
    // which is the same invisible drift in the other direction.
    if (!("bunfig.toml" in files) && existsSync(join(dir, "bunfig.toml"))) {
      found.push(
        `apps/${spec.name}/bunfig.toml exists but the manifest declares no testPreload for it`,
      );
    }
  }
  return found;
};

const check = async (): Promise<never> => {
  const found = await drift();
  if (found.length === 0) {
    process.stdout.write(
      `generated files ok: ${PACKAGES.length.toString()} packages, ${APPS.length.toString()} apps match the manifest\n`,
    );
    process.exit(0);
  }
  process.stderr.write(
    [
      "",
      "Generated files drifted from scripts/packages.manifest.ts:",
      ...found.map((entry) => `  - ${entry}`),
      "",
      "These files are generated, not authored. `bunfig.toml` carries the",
      "coverage floor and `coveragePathIgnorePatterns` that gate 3 enforces,",
      "`tsconfig.json` decides what gate 2 sees, and `package.json` carries the",
      "`exports` map gate 4 snapshots — so an edit here can switch a gate off",
      "without any gate noticing. Change the manifest and run",
      "`bun run new:package`, or put the file back.",
      "",
    ].join("\n"),
  );
  process.exit(1);
};

const main = async (): Promise<void> => {
  if (process.argv.includes("--check")) {
    await check();
  }
  const requested = process.argv
    .slice(2)
    .find((argument) => !argument.startsWith("--"));
  const packages =
    requested === undefined
      ? PACKAGES
      : PACKAGES.filter((p) => p.name === requested);
  if (packages.length === 0) {
    throw new Error(
      `No package named "${requested}" in scripts/packages.manifest.ts. Add it there first.`,
    );
  }
  for (const spec of packages) {
    if (isHandWritten(spec)) {
      continue;
    }
    await syncPackage(spec);
  }
  if (requested === undefined) {
    for (const spec of APPS) {
      await syncApp(spec);
    }
    const onDisk = await readdir(join(ROOT, "packages")).catch(() => []);
    const known = new Set(PACKAGES.map((p) => p.name));
    const orphans = onDisk.filter((name) => !known.has(name));
    if (orphans.length > 0) {
      throw new Error(
        `packages/ contains directories missing from the manifest: ${orphans.join(", ")}`,
      );
    }
  }
  // Generated JSON is written by a plain serializer; biome owns the final
  // formatting, so a regenerate never leaves `test:lint` red. Scoped to the
  // requested package when there is one, so a builder regenerating its own
  // package never reformats a file someone else is editing.
  const scope =
    requested === undefined ? [] : [join("packages", requested), "scripts"];
  Bun.spawnSync(
    [
      "bun",
      "x",
      "biome",
      "check",
      "--max-diagnostics=none",
      "--write",
      ...scope,
    ],
    {
      cwd: ROOT,
      stderr: "inherit",
      stdout: "ignore",
    },
  );
  process.stdout.write(`synced ${packages.length} package(s)\n`);
};

await main();
