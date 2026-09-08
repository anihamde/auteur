import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { FitMeasure } from "@auteur/core/fit";
import type { StyleCard } from "@auteur/core/style-card";

/**
 * Gate 8: the invariants, as a machine that keeps saying so.
 *
 * auteur's analogue of nexus's boundary-suite. Everything here is a rule that
 * would otherwise be a habit — the kind that holds for six months and then
 * quietly stops, because the person who knew it left and the code that broke it
 * looked reasonable.
 *
 * Five assertions, and each is one of the four invariants in force:
 *
 * 1. A card's `prosody` is what `prosody` computed. Invariant 1.
 * 2. Every `derived` claim carries a citation that resolves. Invariant 2.
 * 3. Nothing writes `card_overlays`. §4.6's strong form.
 * 4. An edited measure appears twice. §9.3.
 * 5. Every export carries the §7.6 label.
 *
 * The functions are exported individually rather than run as one pass, because
 * `gate-self-test.ts` needs to break one thing and watch one assertion fail: a
 * single pass that returned a boolean would pass its negative control by
 * failing for the wrong reason.
 */

export type Violation = { readonly where: string; readonly what: string };

/**
 * Invariant 1: a card's prosody is a measurement, not an opinion.
 *
 * Compared field by field against what the caller measured from the same
 * works. A mismatch means something between the measurement and the card
 * changed a number — which is the failure that cannot be seen by reading the
 * card, because a wrong number looks exactly like a right one.
 */
export const cardProsodyMatches = (
  card: StyleCard,
  computed: StyleCard["prosody"],
): Violation[] => {
  const violations: Violation[] = [];
  const left = JSON.stringify(card.prosody);
  const right = JSON.stringify(computed);
  if (left !== right) {
    violations.push({
      what: "the card's prosody block differs from what prosody computed from the same works",
      where: `card ${card.id}`,
    });
  }
  if (
    JSON.stringify(card.prosodyTarget.sentenceLength) !==
    JSON.stringify(card.prosody.sentenceLength)
  ) {
    violations.push({
      what: "the target differs from the measurement, and no v1 path writes an overlay (§4.6)",
      where: `card ${card.id}`,
    });
  }
  return violations;
};

/**
 * Invariant 2: every derived claim cites a passage that exists.
 *
 * `claimSchema` already refuses a derived claim with no citation. What this
 * adds is that the citation **resolves**: a passage id that parses and points
 * at nothing is invariant 2 failing in the one way a reader cannot detect,
 * because the mark is there and the link is dead.
 */
export const citationsResolve = (
  card: StyleCard,
  knownPassageIds: ReadonlySet<string>,
): Violation[] => {
  const violations: Violation[] = [];
  const walk = (value: unknown, path: string): void => {
    if (typeof value !== "object" || value === null) return;
    const claim = value as {
      origin?: unknown;
      citation?: { passageId?: string };
    };
    if (typeof claim.origin === "string") {
      if (claim.origin === "derived") {
        const passageId = claim.citation?.passageId;
        if (passageId === undefined) {
          violations.push({
            what: "a derived claim with no citation",
            where: path,
          });
        } else if (!knownPassageIds.has(passageId)) {
          violations.push({
            what: `a citation pointing at ${passageId}, which is not a stored passage`,
            where: path,
          });
        }
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      walk(child, path === "" ? key : `${path}.${key}`);
    }
  };

  for (const group of [
    "antiPatterns",
    "dialogue",
    "diction",
    "imagery",
    "rhythm",
    "structure",
    "voice",
  ] as const) {
    walk(card[group], group);
  }

  for (const exemplar of card.exemplars) {
    if (!knownPassageIds.has(exemplar.passageId)) {
      violations.push({
        what: `an exemplar citing ${exemplar.passageId}, which is not a stored passage`,
        where: `exemplars`,
      });
    }
  }
  return violations;
};

/**
 * §9.3: an edited measure appears twice, once against each basis.
 *
 * Checked over the whole list rather than per measure, because the property is
 * about the list: a single `edited` verdict is a report that scored a story
 * against a target the product moved and said nothing about the corpus.
 */
export const editedMeasuresAppearTwice = (
  measures: readonly FitMeasure[],
): Violation[] => {
  const byPath = new Map<string, FitMeasure[]>();
  for (const measure of measures) {
    byPath.set(measure.path, [...(byPath.get(measure.path) ?? []), measure]);
  }

  const violations: Violation[] = [];
  for (const [path, group] of byPath) {
    const origins = group.map((measure) => measure.targetOrigin);
    if (!origins.includes("edited")) continue;
    if (!origins.includes("measured")) {
      violations.push({
        what: "an edited measure with no measured verdict beside it (§9.3)",
        where: path,
      });
    }
  }
  return violations;
};

/** §7.6: every export document carries the label. */
export const exportCarriesLabel = (
  document: string,
  where = "export",
): Violation[] =>
  document.includes("Generated by auteur in the style of") &&
  document.includes("AI-generated text; not written by the author.")
    ? []
    : [{ what: "an export document with no attribution label (§7.6)", where }];

/**
 * §4.6's strong form: **nothing writes `card_overlays`.**
 *
 * A source scan rather than a runtime assertion, because the property is about
 * code that does not exist. There is no v1 path to observe, and a test that ran
 * the pipeline and checked the table would pass on the day someone added the
 * writer and forgot to run it.
 *
 * The scan is deliberately crude — an INSERT, UPDATE or DELETE naming the table
 * — because a clever scan is one that a slightly different phrasing slips past.
 * `card-store` is exempt: it is where the writer will live when the v1.1
 * editing UI lands, and its own tests are what exercise the mechanism today.
 */
export const EXEMPT_FROM_OVERLAY_SCAN = [
  "packages/card-store",
  "packages/provenance-suite",
];

const OVERLAY_WRITE =
  /\b(insert\s+into|update|delete\s+from)\s+card_overlays\b/i;

const sourceFiles = (root: string, area: string): string[] => {
  const base = join(root, area);
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      if (entry === "node_modules" || entry === ".turbo") continue;
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (/\.tsx?$/.test(entry)) found.push(path);
    }
  };
  try {
    walk(base);
  } catch {
    // The area does not exist yet, which is not a violation.
  }
  return found;
};

export const nothingWritesOverlays = (root: string): Violation[] => {
  const violations: Violation[] = [];
  for (const area of ["packages", "apps"]) {
    for (const path of sourceFiles(root, area)) {
      const relative = path.slice(root.length + 1);
      if (
        EXEMPT_FROM_OVERLAY_SCAN.some((exempt) => relative.startsWith(exempt))
      ) {
        continue;
      }
      const source = readFileSync(path, "utf8");
      if (OVERLAY_WRITE.test(source)) {
        violations.push({
          what: "a write to card_overlays, which no v1 path may do (§4.6)",
          where: relative,
        });
      }
    }
  }
  return violations;
};
