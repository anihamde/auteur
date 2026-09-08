#!/usr/bin/env bun
/**
 * Score the latinate classifier against the hand-labelled validation set.
 *
 * S3's harness. It is written now and has nothing to score yet: the set is
 * drawn from a real corpus this environment cannot fetch, and hand-labelled
 * (`scripts/draw-word-types.ts`). What it does today is refuse to pretend
 * otherwise.
 *
 * **The threshold is 0.85 precision** (`ARCHITECTURE.md` §4.3), and the branch
 * is written before the number is known so that neither outcome is a judgement
 * call afterwards:
 *
 * - **≥ 0.85** — `latinateGate()` flips to `{ validated: true, precision }`,
 *   and the report's fifth measure carries the measured precision instead of
 *   the word "unvalidated".
 * - **< 0.85** — the measure is demoted out of the scored set and becomes a
 *   draft-prompt hint. One line, because the scored set asks the gate rather
 *   than counting to five.
 *
 * Either way it is decision `0003`, with the measured precision and recall in
 * it.
 */
import { scoreClassifier } from "../packages/prosody/src/latinate.ts";

/** §4.3's threshold. Not a tunable: it is the number the decision cites. */
export const PRECISION_THRESHOLD = 0.85;

export type Labelled = { readonly type: string; readonly latinate: boolean };

export type ReadResult =
  | { readonly ok: true; readonly labelled: readonly Labelled[] }
  | { readonly ok: false; readonly problem: string };

type FileShape = {
  types?: { type?: unknown; latinate?: unknown }[];
};

/**
 * Read a labelling file, refusing one that is not finished.
 *
 * An unlabelled row is `latinate: null`, and a file holding one is rejected
 * rather than skipped. Skipping would score the classifier against whichever
 * rows a person happened to reach, and report that number as the precision of
 * the whole set.
 */
export const readLabelled = (payload: unknown): ReadResult => {
  const file = payload as FileShape;
  if (!Array.isArray(file.types)) {
    return { ok: false, problem: "The file has no `types` array." };
  }
  const labelled: Labelled[] = [];
  const unlabelled: string[] = [];
  for (const row of file.types) {
    if (typeof row.type !== "string" || row.type.length === 0) {
      return { ok: false, problem: "A row has no `type`." };
    }
    if (typeof row.latinate !== "boolean") {
      unlabelled.push(row.type);
      continue;
    }
    labelled.push({ latinate: row.latinate, type: row.type });
  }
  if (unlabelled.length > 0) {
    return {
      ok: false,
      problem:
        `${unlabelled.length.toString()} of ${file.types.length.toString()} rows are unlabelled, ` +
        `starting with "${unlabelled[0] ?? ""}". Scoring the rest would report ` +
        "the precision of whichever rows someone reached as the precision of the set.",
    };
  }
  if (labelled.length === 0) {
    return { ok: false, problem: "The file holds no rows." };
  }
  return { labelled, ok: true };
};

export type Verdict = {
  readonly precision: number;
  readonly recall: number;
  readonly keep: boolean;
};

export const verdictFor = (labelled: readonly Labelled[]): Verdict => {
  const report = scoreClassifier(labelled);
  return {
    keep: report.precision >= PRECISION_THRESHOLD,
    precision: report.precision,
    recall: report.recall,
  };
};

export const renderVerdict = (verdict: Verdict, total: number): string =>
  [
    `${total.toString()} labelled word types.`,
    `precision ${verdict.precision.toFixed(3)}  recall ${verdict.recall.toFixed(3)}`,
    "",
    verdict.keep
      ? `precision is at or above ${PRECISION_THRESHOLD.toString()}: latinateRatio stays a scored measure, and latinateGate() carries the measured precision instead of "unvalidated".`
      : `precision is below ${PRECISION_THRESHOLD.toString()}: latinateRatio is demoted out of the scored set and becomes a draft-prompt hint. The scored set asks the gate, so this is one line.`,
    "",
    "Write decision 0003 with these two numbers in it.",
  ].join("\n");

if (import.meta.main) {
  const path = process.argv[2];
  if (path === undefined) {
    process.stderr.write(
      "Usage: bun scripts/score-latinate.ts <labelled.json>\n\n" +
        "The set does not exist yet. It is drawn from a real corpus by\n" +
        "scripts/draw-word-types.ts and labelled by hand; this environment\n" +
        "cannot fetch the corpus, so both are WP-X0's.\n" +
        "Until then latinateRatio ships scored and unvalidated, and every\n" +
        "measure it produces says so.\n",
    );
    process.exit(1);
  }
  const result = readLabelled(await Bun.file(path).json());
  if (!result.ok) {
    process.stderr.write(`${result.problem}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `${renderVerdict(verdictFor(result.labelled), result.labelled.length)}\n`,
  );
}
