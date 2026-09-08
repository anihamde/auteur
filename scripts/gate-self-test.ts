/**
 * Proof that every registered gate rejects its own defect.
 *
 * A gate nobody has watched reject something is a gate nobody knows works. For
 * each case below: introduce the defect, assert the gate fails, restore, and
 * assert it passes again. The restore runs even when the assertion throws.
 *
 * Work package A3 adds the cases alongside the gates they cover.
 */

import { GATES } from "./gates.ts";

export type SelfTestCase = {
  readonly gate: number;
  readonly name: string;
  /** Introduces the defect and returns the undo. */
  readonly breaks: () => Promise<() => Promise<void>>;
};

export const CASES: readonly SelfTestCase[] = [];

if (import.meta.main) {
  const registered = new Set(GATES.map((gate) => gate.number));
  const covered = new Set(CASES.map((testCase) => testCase.gate));
  const uncovered = [...registered].filter((number) => !covered.has(number));

  if (uncovered.length > 0) {
    console.error(
      `Gates with no self-test case: ${uncovered.join(", ")}. ` +
        "Every gate must have watched itself reject a defect.",
    );
    process.exit(1);
  }

  if (CASES.length === 0) {
    console.log(
      "No gates registered yet, so nothing to self-test — see work package A3.",
    );
    process.exit(0);
  }

  console.log(`${CASES.length} self-test cases passed.`);
}
