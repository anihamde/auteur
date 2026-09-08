/**
 * The gate registry.
 *
 * `.github/workflows/ci.yml` runs `bun run gates` and nothing more specific,
 * so adding a CI gate is an ordinary pull request against this file plus the
 * script it names — never an edit to the workflow, which the build session
 * cannot push to (docs/CI-HANDOVER.md).
 *
 * A gate is a script that exits non-zero when the repository holds the defect
 * it exists to catch. Gates 1, 2 and 3 are not here: they are `biome`, `tsc`
 * and `bun test`, run through `turbo test` in a separate CI job, and their
 * negative control is the tool's own.
 */

export type Gate = {
  /** The number this gate carries in the implementation plan, §2.2. */
  readonly number: number;
  readonly name: string;
  /** Path to the script, relative to the repository root. */
  readonly script: string;
  readonly args: readonly string[];
};

/** Ordered by gate number. */
export const GATES: readonly Gate[] = [
  {
    args: ["--check"],
    name: "public API surface",
    number: 4,
    script: "scripts/api-surface.ts",
  },
  {
    args: [],
    name: "dependency direction",
    number: 5,
    script: "scripts/check-dependencies.ts",
  },
  {
    args: ["--check"],
    name: "generated files match the manifest",
    number: 6,
    script: "scripts/new-package.ts",
  },
  {
    args: [],
    name: "bun version pins agree",
    number: 12,
    script: "scripts/check-bun-version.ts",
  },
  {
    args: [],
    name: "no SQL is built by interpolation",
    number: 13,
    script: "scripts/check-sql-literals.ts",
  },
  {
    args: [],
    name: "migrations expand before they contract",
    number: 14,
    script: "scripts/check-migrations.ts",
  },
];

const run = async (gate: Gate): Promise<boolean> => {
  const started = Bun.nanoseconds();
  const proc = Bun.spawn(["bun", gate.script, ...gate.args], {
    stderr: "inherit",
    stdout: "inherit",
  });
  const code = await proc.exited;
  const ms = Math.round((Bun.nanoseconds() - started) / 1e6);
  const mark = code === 0 ? "ok  " : "FAIL";
  console.log(`${mark} gate ${gate.number} — ${gate.name} (${ms}ms)`);
  return code === 0;
};

if (import.meta.main) {
  if (GATES.length === 0) {
    console.log(
      "No gates registered yet — they land in work package A3. " +
        "Gates 1, 2 and 3 run through `turbo test`.",
    );
    process.exit(0);
  }

  const results = await Promise.all(GATES.map(run));
  const failed = results.filter((ok) => !ok).length;
  if (failed > 0) {
    console.error(`\n${failed} of ${GATES.length} gates failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${GATES.length} gates passed.`);
}
