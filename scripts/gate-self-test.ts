#!/usr/bin/env bun
/**
 * Proof that every registered gate rejects its own defect.
 *
 * A gate nobody has watched reject something is a gate nobody knows works. For
 * each case: introduce the defect, assert the gate fails, restore, and assert
 * it passes again. The restore runs even when the assertion throws, so a failed
 * case cannot leave the tree broken for the next one.
 *
 * Gates 1, 2 and 3 have no case here and never will: they are biome, tsc and
 * `bun test`, whose negative control is the tool's own output rather than a
 * defect this script synthesizes.
 */
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { GATES } from "./gates.ts";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const NO_CASE_NEEDED = new Set([1, 2, 3]);

export type SelfTestCase = {
  readonly gate: number;
  /** What the defect is, phrased as the thing the gate must not allow. */
  readonly name: string;
  /** Introduces the defect and returns the undo. */
  readonly breaks: () => Promise<() => Promise<void>>;
};

const gateByNumber = new Map(GATES.map((gate) => [gate.number, gate]));

const runGate = async (number: number): Promise<boolean> => {
  const gate = gateByNumber.get(number);
  if (gate === undefined) {
    throw new Error(`no gate numbered ${number.toString()}`);
  }
  const proc = Bun.spawn(["bun", gate.script, ...gate.args], {
    stderr: "ignore",
    stdout: "ignore",
  });
  return (await proc.exited) === 0;
};

/** Replaces a substring in a file and returns the undo. */
const patchFile = async (
  relative: string,
  from: string,
  to: string,
): Promise<() => Promise<void>> => {
  const path = join(ROOT, relative);
  const original = await Bun.file(path).text();
  if (!original.includes(from)) {
    throw new Error(`self-test anchor not found in ${relative}: ${from}`);
  }
  await Bun.write(path, original.replace(from, to));
  return async () => {
    await Bun.write(path, original);
  };
};

/**
 * Writes a file that did not exist and returns the undo.
 *
 * The undo removes the whole directory `Bun.write` created, not just the file.
 * Deleting only the file leaves an empty directory behind, which the orphan
 * check still reads — so the gate stays red after the undo and the case reports
 * a failure that is the harness's, not the gate's. This self-test found that in
 * itself on its first run.
 */
const addFile = async (
  relative: string,
  contents: string,
): Promise<() => Promise<void>> => {
  const path = join(ROOT, relative);
  await Bun.write(path, contents);
  return async () => {
    await rm(dirname(path), { force: true, recursive: true });
  };
};

export const CASES: readonly SelfTestCase[] = [
  {
    // The defect gate 6 exists for: `bunfig.toml` carries the coverage floor,
    // so editing it on disk sets a package's floor to zero while the manifest
    // still says 0.9 and every other gate stays green.
    breaks: async () => {
      const undoPackage = await addFile(
        "packages/ids/package.json",
        '{ "name": "@auteur/ids", "private": true }\n',
      );
      return async () => {
        await undoPackage();
      };
    },
    gate: 6,
    name: "a materialized package.json the manifest did not generate",
  },
  {
    // A file nobody exports is not in the contract — the surface comes from
    // the `exports` map, not from what is on disk — so the defect to
    // demonstrate is a subpath that *is* exported and whose snapshot does not
    // match. Materializing a manifest-declared package with a real export and
    // no committed api-surface.md is exactly that, and it is the shape every
    // future package arrives in.
    breaks: async () => {
      const undoManifest = await addFile(
        "packages/ids/package.json",
        `${JSON.stringify(
          {
            exports: { "./new-id": "./src/new-id.ts" },
            name: "@auteur/ids",
            private: true,
            type: "module",
            version: "0.0.0",
          },
          null,
          2,
        )}\n`,
      );
      const undoSource = await addFile(
        "packages/ids/src/new-id.ts",
        "export const newId = (): string => crypto.randomUUID();\n",
      );
      return async () => {
        await undoSource();
        await undoManifest();
      };
    },
    gate: 4,
    name: "an exported subpath with no committed snapshot",
  },
  {
    breaks: () =>
      patchFile(
        "packages/tsconfig/api-surface.md",
        "_data file; the subpath itself is the contract_",
        "_something a hand edit put here_",
      ),
    gate: 4,
    name: "a hand-edited api-surface.md",
  },
  {
    breaks: () =>
      patchFile(
        "packages/tsconfig/package.json",
        '"name": "@auteur/tsconfig",',
        '"dependencies": { "@auteur/component-library": "workspace:*" },\n  "name": "@auteur/tsconfig",',
      ),
    gate: 5,
    name: "a tooling package depending upward on the ui layer",
  },
  {
    breaks: () =>
      patchFile(
        "packages/biome-config/package.json",
        '"name": "@auteur/biome-config",',
        '"dependencies": { "zod": "^4.0.0" },\n  "name": "@auteur/biome-config",',
      ),
    gate: 5,
    name: "a third-party version pinned outside the catalog",
  },
  {
    breaks: () =>
      patchFile(
        "packages/tsconfig/package.json",
        '"name": "@auteur/tsconfig",',
        '"dependencies": { "@auteur/biome-config": "workspace:*" },\n  "name": "@auteur/tsconfig",',
      ),
    gate: 5,
    name: "a workspace dependency the manifest does not declare",
  },
  {
    breaks: () =>
      addFile(
        "packages/not-in-the-manifest/package.json",
        '{ "name": "@auteur/not-in-the-manifest", "private": true }\n',
      ),
    gate: 5,
    name: "a package on disk that the manifest does not declare",
  },
];

if (import.meta.main) {
  const uncovered = GATES.map((gate) => gate.number)
    .filter((number) => !NO_CASE_NEEDED.has(number))
    .filter((number) => !CASES.some((testCase) => testCase.gate === number));

  if (uncovered.length > 0) {
    process.stderr.write(
      `Gates with no self-test case: ${uncovered.join(", ")}. ` +
        "Every gate must have watched itself reject a defect.\n",
    );
    process.exit(1);
  }

  let failed = 0;
  for (const testCase of CASES) {
    const before = await runGate(testCase.gate);
    if (!before) {
      process.stderr.write(
        `gate ${testCase.gate.toString()} was already failing before "${testCase.name}" — fix the tree first\n`,
      );
      process.exit(1);
    }

    const undo = await testCase.breaks();
    let rejected: boolean;
    try {
      rejected = !(await runGate(testCase.gate));
    } finally {
      await undo();
    }

    const restored = await runGate(testCase.gate);
    if (!rejected) {
      failed += 1;
      process.stderr.write(
        `FAIL gate ${testCase.gate.toString()} accepted: ${testCase.name}\n`,
      );
    } else if (!restored) {
      failed += 1;
      process.stderr.write(
        `FAIL gate ${testCase.gate.toString()} stayed red after undoing: ${testCase.name}\n`,
      );
    } else {
      process.stdout.write(
        `ok   gate ${testCase.gate.toString()} rejects: ${testCase.name}\n`,
      );
    }
  }

  if (failed > 0) {
    process.stderr.write(`\n${failed.toString()} self-test case(s) failed.\n`);
    process.exit(1);
  }
  process.stdout.write(
    `\n${CASES.length.toString()} self-test cases passed across ${GATES.length.toString()} gates.\n`,
  );
}
