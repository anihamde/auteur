import type { Finding, FitMeasure } from "@auteur/core/fit";
import { findingSchema } from "@auteur/core/fit";
import type { StyleCard } from "@auteur/core/style-card";

/**
 * Validating what `critique` returned, `ARCHITECTURE.md` §9.2.
 *
 * Two rules, and both are about the product's central claim — that numbers
 * carry the argument:
 *
 * - **A finding whose text contains no digit is dropped.** "The voice feels
 *   slightly off" is the exact failure mode this whole design exists to avoid.
 *   The schema requires the digit, so this is a parse failure rather than a
 *   judgement, and the engine drops the finding rather than rendering it.
 * - **`path` must exist on the card or in the measures.** A finding citing a
 *   field that does not exist is a claim the reader cannot check against
 *   anything, and it renders beside nothing.
 */

/** Every path a finding may cite. */
export const citablePaths = (
  card: StyleCard,
  measures: readonly FitMeasure[],
): Set<string> => {
  const paths = new Set(measures.map((measure) => measure.path));
  const walk = (value: unknown, prefix: string): void => {
    if (typeof value !== "object" || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      const path = prefix === "" ? key : `${prefix}.${key}`;
      paths.add(path);
      // A claim is a leaf: its `value`, `origin` and `citation` are not paths
      // anyone would cite, and adding them would let a finding cite
      // `voice.pov.origin`.
      if (typeof child === "object" && child !== null && !("origin" in child)) {
        walk(child, path);
      }
    }
  };
  walk(card, "");
  return paths;
};

export type Triage = {
  readonly kept: readonly Finding[];
  readonly dropped: readonly {
    readonly why: string;
    readonly finding: unknown;
  }[];
};

export const triageFindings = (
  raw: readonly unknown[],
  card: StyleCard,
  measures: readonly FitMeasure[],
): Triage => {
  const paths = citablePaths(card, measures);
  const kept: Finding[] = [];
  const dropped: { why: string; finding: unknown }[] = [];

  for (const candidate of raw) {
    const parsed = findingSchema.safeParse(candidate);
    if (!parsed.success) {
      dropped.push({
        finding: candidate,
        why:
          parsed.error.issues[0]?.message ??
          "the finding does not parse as a finding",
      });
      continue;
    }
    if (!paths.has(parsed.data.path)) {
      dropped.push({
        finding: candidate,
        why: `${parsed.data.path} is not a path on the card or in the measures`,
      });
      continue;
    }
    kept.push(parsed.data);
  }

  return { dropped, kept };
};

/**
 * What `revise` is given.
 *
 * **Only findings that are not `pass`.** A revision handed a passing finding
 * would be asked to change prose that is already in style, and the most likely
 * outcome is that it moves a number that was fine. The remedy is carried
 * through because it is the instruction; a drift with no remedy is a finding
 * the critique could not say what to do about, and `revise` is told that
 * explicitly rather than left to infer it.
 */
export const forRevision = (findings: readonly Finding[]): Finding[] =>
  findings.filter((finding) => finding.status !== "pass");
