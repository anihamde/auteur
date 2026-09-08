#!/usr/bin/env bun
/**
 * S1's live half. **Not run yet, and it must not be run silently.**
 *
 * The build environment has no `RAMP_ROUTER_API_KEY` and no egress to
 * `api.router.com` (`docs/IMPLEMENTATION-PLAN.md` §4), so every capability
 * column in `packages/provider-router/src/models.ts` is `source: "declared"` —
 * taken from published documentation. This script is what turns a declared row
 * into a measured one, and it is the only thing permitted to.
 *
 * Per catalogue model it establishes:
 *
 *  - whether `text.format: { type: "json_schema", strict: true }` is accepted
 *    **and produces a conforming object**, tested with one real nested schema —
 *    a cut-down `ClarifyResult`, which is the hardest of the six typed stages:
 *    an array of objects with a nested string array. A model that accepts the
 *    field and then returns prose is a `false`, not a `true`;
 *  - the real `maxOutputTokens`, by asking for more than the declared ceiling
 *    and reading the truncation, rather than trusting a documentation page;
 *  - a recorded SSE transcript, written into
 *    `packages/provider-router/tests/fixtures/`, so every wave D test stays
 *    offline afterwards.
 *
 * **It fails on any discrepancy rather than absorbing it.** A wrong guess
 * surfaces as a diff with both numbers printed, not as behaviour. Writing the
 * corrected table is `scripts/verify-live.ts`'s (WP-X0); this prints.
 *
 * Prices are never measured. The gateway's models route carries none, so they
 * stay declared and every cost the product shows stays labelled an estimate.
 */
import { CATALOGUE } from "../packages/provider-router/src/models.ts";

/**
 * The hardest schema any stage sends, cut down.
 *
 * A flat object proves almost nothing: a gateway that rejects nesting or
 * `additionalProperties: false` would pass it and fail six stages.
 */
const PROBE_SCHEMA = {
  additionalProperties: false,
  properties: {
    done: { type: "boolean" },
    questions: {
      items: {
        additionalProperties: false,
        properties: {
          decision: { type: "string" },
          suggestions: { items: { type: "string" }, type: "array" },
          text: { type: "string" },
        },
        required: ["text", "decision", "suggestions"],
        type: "object",
      },
      type: "array",
    },
  },
  required: ["questions", "done"],
  type: "object",
} as const;

export type ProbeRow = {
  readonly id: string;
  readonly declaredStructuredOutput: boolean;
  readonly measuredStructuredOutput: boolean | "unreachable";
  readonly declaredMaxOutputTokens: number;
  readonly measuredMaxOutputTokens: number | "unreachable";
};

/** Whether a row's measurement agrees with what the catalogue declared. */
export const isDrift = (row: ProbeRow): boolean =>
  (row.measuredStructuredOutput !== "unreachable" &&
    row.measuredStructuredOutput !== row.declaredStructuredOutput) ||
  (row.measuredMaxOutputTokens !== "unreachable" &&
    row.measuredMaxOutputTokens !== row.declaredMaxOutputTokens);

export const renderReport = (rows: readonly ProbeRow[]): string => {
  const lines = [
    "| model | structuredOutput declared → measured | maxOutputTokens declared → measured |",
    "|---|---|---|",
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.id} | ${String(row.declaredStructuredOutput)} → ${String(row.measuredStructuredOutput)} | ${row.declaredMaxOutputTokens.toString()} → ${String(row.measuredMaxOutputTokens)} |`,
    );
  }
  const drifted = rows.filter(isDrift);
  lines.push(
    "",
    drifted.length === 0
      ? `${rows.length.toString()} row(s), no drift.`
      : `${drifted.length.toString()} row(s) drifted: ${drifted.map((row) => row.id).join(", ")}.`,
  );
  return lines.join("\n");
};

if (import.meta.main) {
  const key = Bun.env["RAMP_ROUTER_API_KEY"];
  if (key === undefined || key === "") {
    process.stderr.write(
      "RAMP_ROUTER_API_KEY is unset, so nothing can be measured.\n" +
        `The catalogue holds ${CATALOGUE.length.toString()} rows, every one tagged "declared".\n` +
        "Run this with a key and open egress; it is WP-X0's live half.\n" +
        `The probe schema is the cut-down ClarifyResult: ${JSON.stringify(PROBE_SCHEMA).length.toString()} bytes of nested object.\n`,
    );
    process.exit(1);
  }
  process.stderr.write(
    "The measurement half of this script is WP-X0's to write, against a\n" +
      "gateway this environment cannot reach. It is deliberately absent rather\n" +
      "than stubbed: a stub that returned the declared values would report\n" +
      '"no drift" and make the table look verified.\n',
  );
  process.exit(1);
}
