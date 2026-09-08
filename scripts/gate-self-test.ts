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
import { existsSync } from "node:fs";
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
 * Writes a file into a directory that did not exist, and removes both again.
 *
 * The undo removes the directory `Bun.write` created, not just the file.
 * Deleting only the file leaves an empty directory behind, which the orphan
 * check still reads — so the gate stays red after the undo and the case reports
 * a failure that is the harness's, not the gate's. This self-test found that in
 * itself on its first run.
 *
 * It **refuses a directory that already exists**, which is the other half of
 * the same lesson: this deletes recursively, and pointed at a real package it
 * takes the package with it. It did exactly that once, to `packages/ids`, on
 * the run that materialized it — the case was written when `ids` was still
 * declared-and-not-materialized and quietly became destructive the day it was
 * built. Use `addAndRemoveFile` for a file inside a directory that exists.
 */
const addFile = async (
  relative: string,
  contents: string,
): Promise<() => Promise<void>> => {
  const path = join(ROOT, relative);
  const directory = dirname(path);
  if (existsSync(directory)) {
    throw new Error(
      `${relative} sits in a directory that already exists. addFile's undo ` +
        "removes that directory recursively; use addAndRemoveFile instead.",
    );
  }
  await Bun.write(path, contents);
  return async () => {
    await rm(directory, { force: true, recursive: true });
  };
};

/**
 * Writes a file into a directory that already exists, and removes just that
 * file. `addFile`'s undo takes the whole directory with it, which is right for
 * a package it invented and catastrophic for one holding real content.
 */
const addAndRemoveFile = async (
  relative: string,
  contents: string,
): Promise<() => Promise<void>> => {
  const path = join(ROOT, relative);
  if (existsSync(path)) {
    throw new Error(
      `${relative} already exists. This undo deletes the file rather than ` +
        "restoring it; use patchFile to modify one that is already there.",
    );
  }
  await Bun.write(path, contents);
  return async () => {
    await rm(path, { force: true });
  };
};

export const CASES: readonly SelfTestCase[] = [
  {
    breaks: () => patchFile(".bun-version", "1.3.11", "1.3.10"),
    gate: 12,
    name: "CI and contributors pinned to different bun versions",
  },
  {
    breaks: () =>
      patchFile("package.json", '"bun": ">=1.3.11"', '"bun": ">=1.4.0"'),
    gate: 12,
    name: "an engines floor that excludes the pinned version",
  },
  {
    // The defect gate 6 exists for: `bunfig.toml` carries the coverage floor,
    // so editing it on disk sets a package's floor to zero while the manifest
    // still says 0.9 and every other gate stays green.
    breaks: () =>
      patchFile(
        "packages/ids/package.json",
        '"name": "@auteur/ids",',
        '"name": "@auteur/ids",\n  "sideEffects": false,',
      ),
    gate: 6,
    name: "a hand-edited package.json the manifest did not generate",
  },
  {
    // A file nobody exports is not in the contract — the surface comes from
    // the `exports` map, not from what is on disk — so the defect to
    // demonstrate is a subpath that *is* exported and whose snapshot does not
    // match. Materializing a manifest-declared package with a real export and
    // no committed api-surface.md is exactly that, and it is the shape every
    // future package arrives in.
    breaks: () =>
      patchFile(
        "packages/ids/src/parse-id.ts",
        "export const",
        "export const widenedTheContract = (): number => 1;\n\nexport const",
      ),
    gate: 4,
    name: "an exported name with no committed snapshot",
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
  {
    // The injection that reads exactly like the parameterized form. `sql.ts`
    // is chosen because it is the file most likely to be edited by someone
    // adding a query helper, and it is not a test.
    breaks: () =>
      patchFile(
        "packages/db/src/sql.ts",
        "export const oneRow =",
        "export const byId = (id: string): string =>\n  `SELECT * FROM sessions WHERE id = ${id}`;\n\nexport const oneRow =",
      ),
    gate: 13,
    name: "a value interpolated into a query instead of bound",
  },
  {
    // Expand and contract in one file. This is the shape that breaks a rollout
    // with two deploy units live: the migration runs, the new code works, and
    // every request still served by the previous version fails on a column
    // that is no longer there.
    // Written with `Bun.write` rather than `addFile`, whose undo removes the
    // containing directory — which here holds the real migrations.
    breaks: () =>
      addAndRemoveFile(
        "packages/migrations/sql/0003_self_test.sql",
        "ALTER TABLE sessions ADD COLUMN idea_text text;\n" +
          "ALTER TABLE sessions DROP COLUMN idea;\n",
      ),
    gate: 14,
    name: "a migration that drops a column in the file that adds its replacement",
  },
  {
    breaks: () =>
      addAndRemoveFile(
        "packages/migrations/sql/0004_gap.sql",
        "-- a version with no 0003 before it\n",
      ),
    gate: 14,
    name: "a gap in the migration versions",
  },
  {
    // The whole point of the lock is that a refresh from upstream is a
    // readable diff. An in-place edit makes it archaeology, and the correct
    // home for a deviation is docs/guidelines/local/ with `overrides:`.
    breaks: () =>
      patchFile(
        "docs/guidelines/testing.md",
        "# Testing",
        "# Testing\n\nA sentence somebody added to the seed.",
      ),
    gate: 10,
    name: "a seeded guideline edited in place",
  },
  {
    breaks: () =>
      patchFile(
        "AGENTS.md",
        "| [Types](docs/guidelines/types.md)",
        "| [Types](docs/guidelines/types-renamed.md)",
      ),
    gate: 10,
    name: "an id dropped from the index",
  },
  {
    // It supersedes nothing, so its rules read as the repository's when they
    // are one half of a conversation with a document nobody has.
    breaks: () =>
      addAndRemoveFile(
        "docs/guidelines/local/self-test.md",
        [
          "---",
          "id: self-test",
          "title: Self test",
          "covers: nothing",
          "tier: if-touched",
          'trigger: "Never."',
          "overrides: [nextjs]",
          "---",
          "",
          "# Self test",
          "",
          "Overrides a guideline that was not ported.",
          "",
        ].join("\n"),
      ),
    gate: 10,
    name: "a local doc overriding a guideline that was not ported",
  },
  {
    // Promotion is the only direction the precedence rules allow, so a
    // "promotion" of an ALWAYS document is a no-op or an attempt to weaken it.
    breaks: async () => {
      const undo = await addFile(
        "packages/ids/docs/AGENTS.md",
        [
          "---",
          "package: packages/ids",
          "promotes:",
          "  always: [testing]",
          "---",
          "",
          "# @auteur/ids",
          "",
          "Promotes a document that is already ALWAYS.",
          "",
        ].join("\n"),
      );
      return undo;
    },
    gate: 10,
    name: "an addendum promoting a document that is already ALWAYS",
  },
  {
    breaks: () =>
      addAndRemoveFile(
        "docs/decisions/0004-self-test.md",
        [
          "# 0004 — A decision the index does not name",
          "",
          "**Status:** accepted · **Date:** 2026-09-08",
          "",
          "## Context",
          "",
          "Written to prove the index check runs.",
          "",
        ].join("\n"),
      ),
    gate: 15,
    name: "a decision the generated index does not name",
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
