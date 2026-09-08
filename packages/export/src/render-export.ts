import { COPY } from "@auteur/copy/index";
import type { FitMeasure } from "@auteur/core/fit";
import type { DecisionEntry } from "@auteur/core/session";
import type { ProsodyUnit } from "@auteur/formatting/prosody-value";
import { prosodyValue } from "@auteur/formatting/prosody-value";

/**
 * The export, and the label that cannot be forgotten.
 *
 * `ARCHITECTURE.md` §7.6 states the one rule structurally rather than as a
 * convention: **`renderExport` takes the label as a required parameter, and
 * there is no code path that produces an export document without it.**
 *
 * `PRD.md` §9 requires every export and every story view to carry the
 * attribution sentence. Making that a caller's responsibility means one day a
 * caller forgets — not through carelessness but because the call site that
 * forgets is the one added last, by someone who read the other three and
 * assumed. Making it a required argument of the only function that can produce
 * the document means the type system asks for it at every call site that will
 * ever exist, and `provenance-suite` asserts that every export fixture contains
 * it.
 */

/**
 * The label, as a value rather than a string.
 *
 * A `string` parameter would be satisfied by `""`, and an empty label
 * type-checks its way to a document with the required sentence missing. The
 * author's name is what the sentence is *about*, so the type asks for that and
 * renders the sentence itself.
 */
export type ExportLabel = {
  readonly authorName: string;
};

export type ExportInput = {
  readonly title: string | undefined;
  readonly markdown: string;
  readonly wordCount: number;
  readonly author: { readonly displayName: string };
  readonly cardVersion: number;
  readonly confidence: number;
  readonly summary: string;
  readonly measures: readonly FitMeasure[];
  readonly decisions: readonly DecisionEntry[];
};

/** The §7.6 sentence, with the author's name in it. */
export const attributionFor = (label: ExportLabel): string =>
  COPY.result.attribution.replace("{author}", label.authorName);

/**
 * The unit a measure is rendered in.
 *
 * Derived from the path rather than carried on the measure, because the unit is
 * a property of *what is measured* and not of a particular reading — and a
 * `unit` field on `FitMeasure` would be a field the extraction stage could get
 * wrong. A rate is per thousand words, a ratio is a fraction, and everything
 * else is a word count.
 */
const unitFor = (path: string): ProsodyUnit => {
  if (path.includes("punctuation")) return "per1k";
  if (path.endsWith("Ratio") || path.endsWith("mattr")) return "ratio";
  return "words";
};

const measureLine = (measure: FitMeasure): string => {
  const proxy =
    measure.classifier === undefined
      ? ""
      : ` (${measure.classifier.kind === "suffix-proxy" ? "suffix proxy" : measure.classifier.kind}${measure.classifier.validated ? "" : ", unvalidated"})`;
  const unit = unitFor(measure.path);
  return `| ${measure.label}${proxy} | ${prosodyValue(measure.value, unit)} | ${prosodyValue(measure.band[0], unit)}–${prosodyValue(measure.band[1], unit)} | ${measure.status} |`;
};

const decisionLine = (entry: DecisionEntry): string =>
  `- **${entry.origin}** — ${entry.decision}\n  ${entry.reason}`;

/**
 * Render the document.
 *
 * After the prose: the label, the author and card version, the style-fit
 * summary and the decisions log. A reader who did not run the session can then
 * tell what was chosen for them — which is the same claim the result screen
 * makes, and the reason the log travels with the story rather than staying in
 * the app.
 */
export const renderExport = (
  input: ExportInput,
  label: ExportLabel,
): string => {
  const lines: string[] = [];

  if (input.title !== undefined && input.title.length > 0) {
    lines.push(`# ${input.title}`, "");
  }
  lines.push(input.markdown.trim(), "", "---", "");

  // The label is first among the trailing matter, because it is the one part a
  // reader who scrolls past everything else must still meet.
  lines.push(attributionFor(label), "");

  lines.push(
    `${input.wordCount.toLocaleString("en-US")} words · in the style of ${input.author.displayName} · card@${input.cardVersion.toString()}, confidence ${input.confidence.toFixed(2)}`,
    "",
  );

  lines.push(`## ${COPY.result.tabs.fit}`, "", input.summary, "");
  if (input.measures.length > 0) {
    lines.push(
      "| measure | draft | corpus band | verdict |",
      "|---|---|---|---|",
      ...input.measures.map(measureLine),
      "",
    );
  }

  lines.push(`## ${COPY.result.tabs.decisions}`, "");
  lines.push(
    input.decisions.length === 0
      ? "Nothing was decided that no question covered."
      : input.decisions.map(decisionLine).join("\n"),
    "",
  );

  return lines.join("\n");
};
