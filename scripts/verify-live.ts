#!/usr/bin/env bun
import { createDb } from "../packages/db/src/db.ts";
import { channelFor } from "../packages/event-store/src/events.ts";
import { subscribe } from "../packages/event-store/src/listen.ts";
/**
 * `bun run verify:live` — **[key][net]** the one verification pass.
 *
 * `docs/IMPLEMENTATION-PLAN.md` §5.4 gathers every deferred question into a
 * single sitting: credentials go in, one command runs, one report comes out.
 * Four sub-reports, each separately green or naming what moved:
 *
 *  1. **The catalogue** — whether the committed model catalogue still matches
 *     what the gateway serves, and whether every tier candidate is a model
 *     that exists. The second is the one that took the product down: not one
 *     id in the hand-written table was real, and nothing asked (decision 0028).
 *  2. **The catalogue import** — search and `corpus-select` both read
 *     `authors` and `catalogue_works`, and on a fresh database both are empty.
 *     Nothing else says so: search answers 200 with no rows.
 *  3. **The latinate classifier** — precision against the hand-labelled set,
 *     and the keep-or-demote verdict §4.3 specifies.
 *  4. **The stage schemas** — whether the gateway accepts each of the five
 *     structured-output schemas the stages send. `strict: true` is a narrower
 *     dialect than JSON Schema and a request outside it is refused whole; three
 *     stage failures in one afternoon were exactly that, and every test in the
 *     repository sends its schema to a fake, so none of them could see it.
 *  5. **One real extraction** — whether a model, given the prompt this product
 *     sends, returns an answer that parses *and* builds a card. The schema
 *     being accepted is not the same claim: the deployment's `style-extract`
 *     was accepted, answered valid JSON, and returned no fields at all,
 *     because the prompt named none of the paths a card needs.
 *  6. **`LISTEN`/`NOTIFY` on Neon's direct endpoint** — the mechanism is
 *     verified on stock Postgres; Neon specifically is not, and a pooled
 *     `LISTEN` is accepted and then never delivers, which is the worst shape a
 *     failure can take.
 *
 * **It fails on any discrepancy rather than absorbing one.** That is what makes
 * a green run a claim: every declared value was right. A pass that quietly
 * rewrote what it found would report success for having changed the answer.
 */
import { served } from "../packages/provider-router/src/gateway-models.ts";
import { CATALOGUE } from "../packages/provider-router/src/models.ts";
import { runExtractionProbe } from "./check-extraction.ts";
import { compare, unservedCandidates } from "./check-router-catalogue.ts";
import { checkAll } from "./check-stage-schemas.ts";
import { fetchModels } from "./probe-router-catalogue.ts";
import { STAGE_SCHEMAS } from "./stage-schemas.ts";

export type SubReport = {
  readonly name: string;
  readonly ok: boolean;
  readonly lines: readonly string[];
};

export const renderOne = (report: SubReport): string =>
  [
    `${report.ok ? "ok  " : "FAIL"} ${report.name}`,
    ...report.lines.map((line) => `       ${line}`),
  ].join("\n");

export const render = (reports: readonly SubReport[]): string =>
  [
    ...reports.map(renderOne),
    "",
    reports.every((report) => report.ok)
      ? `All ${reports.length.toString()} checks passed. Every declared value was right.`
      : `${reports.filter((report) => !report.ok).length.toString()} of ${reports.length.toString()} checks found something. Each lands as its own follow-up PR.`,
  ].join("\n");

export const exitCodeFor = (reports: readonly SubReport[]): number =>
  reports.every((report) => report.ok) ? 0 : 1;

/**
 * Whether a `pg_notify` on one connection reaches a `LISTEN` on another.
 *
 * The whole SSE route rests on it. Exported and parameterised by url so the
 * same function proves it against the local test server and against Neon —
 * which is the point: the mechanism and the provider are two claims, and only
 * the first has been checked.
 */
export const checkListenNotify = async (
  url: string,
  timeoutMs = 5000,
): Promise<SubReport> => {
  const db = createDb({ endpoint: "direct", max: 2, url });
  const sessionId = "00000000-0000-4000-8000-000000000001";
  try {
    let delivered: number | undefined;
    const subscription = await subscribe(db, sessionId, (seq) => {
      delivered = seq;
    });
    await db.query(`SELECT pg_notify($1, $2)`, [
      channelFor(sessionId),
      JSON.stringify({ seq: 1, sessionId }),
    ]);
    const deadline = Date.now() + timeoutMs;
    while (delivered === undefined && Date.now() < deadline) {
      await Bun.sleep(50);
    }
    await subscription.close();
    return delivered === undefined
      ? {
          lines: [
            "A notification committed on one connection did not arrive on another.",
            "The SSE route cannot use LISTEN here; §5.3's fallback is polling",
            "`events` on the cursor every 300ms, which costs latency and no",
            "architecture.",
          ],
          name: "LISTEN/NOTIFY on the direct endpoint",
          ok: false,
        }
      : {
          lines: [`delivered seq ${delivered.toString()} across connections`],
          name: "LISTEN/NOTIFY on the direct endpoint",
          ok: true,
        };
  } finally {
    await db.close();
  }
};

/**
 * A sub-report for a check nobody has written yet.
 *
 * Distinct from `missing`, which is a credential away from running. This is
 * the state three of these four were in while reporting `ok` and naming the
 * script that would have checked them — which made a green run mean "nothing
 * ran", the exact thing the header claims it cannot mean.
 */
export const unchecked = (
  name: string,
  why: string,
  command: string,
): SubReport => ({
  lines: [
    why,
    `Run \`${command}\` when that is possible. Until then this is UNVERIFIED,`,
    "and a pass that said otherwise would be the only untrue line in the run.",
  ],
  name,
  ok: false,
});

/** A sub-report for a check that cannot run because a credential is absent. */
/**
 * Whether the catalogue has been imported into this database.
 *
 * Author search and `corpus-select` both read `authors` and `catalogue_works`
 * (decision 0023), and on a fresh database both are empty. Nothing else in the
 * system says so: search answers 200 with an empty list, which is also what a
 * misspelt name looks like, and the run fails two screens later with
 * `corpus_unavailable`.
 */
export const checkCatalogue = async (
  count: (table: string) => Promise<number>,
): Promise<SubReport> => {
  const name = "the catalogue is imported";
  // A count that throws is this check's answer, not an error to propagate: the
  // table not existing means the schema has never come up against this
  // database, which is the same finding one step earlier. Letting it out would
  // lose the other three sub-reports to a stack trace.
  const counted = await Promise.all([
    count("authors"),
    count("catalogue_works"),
  ]).catch((cause: unknown) => cause);
  if (!Array.isArray(counted)) {
    return {
      lines: [
        counted instanceof Error ? counted.message : "the count failed",
        "The schema comes up on the first request to the deployment. Reach",
        "`/api/health` once, then run `bun run catalogue:import`.",
      ],
      name,
      ok: false,
    };
  }
  const [authors = 0, works = 0] = counted;
  if (authors === 0 || works === 0) {
    return {
      lines: [
        `authors: ${authors.toString()}, catalogue_works: ${works.toString()}`,
        "Search finds nobody and a run fails with corpus_unavailable. Run",
        "`bun run catalogue:import` from a machine with egress, pointed at",
        "this database.",
      ],
      name,
      ok: false,
    };
  }
  return {
    lines: [
      `${authors.toLocaleString("en-US")} authors, ${works.toLocaleString("en-US")} works`,
    ],
    name,
    ok: true,
  };
};

/**
 * The committed catalogue against the gateway's live list.
 *
 * This slot used to print that the measurement half of the probe was unwritten
 * and every row was tagged `declared`. Both were true and neither was the
 * problem: the catalogue named models the gateway had never served, and the one
 * check that would have said so never called it. It calls it now.
 */
export const checkCatalogueDrift = async (
  apiKey: string,
  fetchIds: (key: string) => Promise<readonly string[]> = async (key) =>
    served(await fetchModels(key)).map((model) => model.id),
): Promise<SubReport> => {
  const name = "the model catalogue matches the gateway";
  const gatewayIds = await fetchIds(apiKey);
  const drift = compare(
    CATALOGUE.map((row) => row.id),
    gatewayIds,
  );
  const unserved = unservedCandidates(gatewayIds);
  const lines = [
    ...drift.missingFromGateway.map((id) => `no longer served: ${id}`),
    ...drift.absentFromCatalogue.map((id) => `not in the catalogue: ${id}`),
    ...unserved.map((id) => `tier candidate nothing serves: ${id}`),
  ];
  return lines.length === 0
    ? {
        lines: [
          `${CATALOGUE.length.toString()} rows, and every tier candidate exists`,
        ],
        name,
        ok: true,
      }
    : {
        lines: [
          ...lines,
          "Re-run `bun run catalogue:models` and commit the diff. A tier",
          "candidate nothing serves is a stage that fails at its first model",
          "call, which is what this check exists for.",
        ],
        name,
        ok: false,
      };
};

/**
 * The gateway's word on every schema a stage sends.
 *
 * The one check here that cannot be replaced by a unit test, and the reason is
 * structural: every test in this repository hands its schema to a stub, so the
 * dialect the gateway actually enforces is asserted nowhere. `value: {}`,
 * `minItems` silently ignored, and a null inside an enum all shipped green.
 *
 * Five small requests, output capped at sixteen tokens, replies discarded. A
 * refusal arrives before generation, so this is fast and nearly free — which is
 * what makes it worth running before every deploy rather than after one.
 */
export const checkStageSchemas = async (
  apiKey: string,
  modelId = "claude-sonnet-5",
  probe = checkAll,
): Promise<SubReport> => {
  const name = "the gateway accepts every stage schema";
  const verdicts = await probe(apiKey, modelId, STAGE_SCHEMAS);
  const refused = verdicts.filter((verdict) => !verdict.accepted);
  return refused.length === 0
    ? {
        lines: [
          `${verdicts.length.toString()} schemas, all accepted by ${modelId}`,
        ],
        name,
        ok: true,
      }
    : {
        lines: [
          ...refused.map(
            (verdict) => `${verdict.stageId}: ${verdict.reason ?? "refused"}`,
          ),
          "A schema outside strict mode is refused whole, before a token is",
          "generated — so the stage fails every time and says only that the",
          "gateway failed. Fix the schema and record the rule in",
          "`apps/auteur-web/tests/integration/stage-schemas.test.ts`.",
        ],
        name,
        ok: false,
      };
};

/**
 * One real extraction, end to end.
 *
 * The other model check asks whether the gateway *accepts* the schema. This
 * asks whether a model can *satisfy* it — a different claim, and the one that
 * failed last: schema accepted, valid JSON returned, `fields: []`, no card.
 *
 * One call against nine short public-domain passages. It judges the contract
 * and not the reading: whether "a register that reaches for the Latinate
 * abstraction" is a good sentence about Austen is not a thing a check can
 * decide, and one that tried would fail on a good answer it did not expect.
 */
export const checkExtraction = async (
  apiKey: string,
  modelId = "claude-sonnet-5",
  probe = runExtractionProbe,
): Promise<SubReport> => {
  const name = "a real model satisfies the extraction contract";
  const outcome = await probe(apiKey, modelId);
  return outcome.ok
    ? {
        lines: [
          `${outcome.fields.toString()} fields and ${outcome.exemplars.toString()} exemplars from ${modelId}, and a card built from them`,
        ],
        name,
        ok: true,
      }
    : { lines: outcome.lines, name, ok: false };
};

export const missing = (name: string, variable: string): SubReport => ({
  lines: [
    `${variable} is unset, so this was not checked.`,
    "Not checking is not the same as passing, and this pass reports it as a",
    "failure so a green run cannot mean 'we did not look'.",
  ],
  name,
  ok: false,
});

if (import.meta.main) {
  const reports: SubReport[] = [];
  const routerKey = Bun.env["RAMP_ROUTER_API_KEY"];
  const directUrl = Bun.env["DATABASE_URL_DIRECT"];
  const databaseUrl = Bun.env["DATABASE_URL"];

  /**
   * Run one check, saying so before and after.
   *
   * This pass is minutes long — the extraction probe alone is a model call
   * generating a whole card — and it used to print nothing until every check
   * had finished. Silence for two minutes is indistinguishable from a hang,
   * and the first person to run it reported one. A check that has not printed
   * its name yet is the check currently running, which is also the only
   * information anyone wants while waiting.
   */
  const run = async (
    label: string,
    check: () => Promise<SubReport>,
  ): Promise<void> => {
    process.stdout.write(`  …  ${label}\n`);
    const report = await check();
    // Over the "…" line, so the finished run reads as a list of verdicts
    // rather than of each verdict twice. A terminal that does not take the
    // escape simply shows both, which is not a failure.
    process.stdout.write(`\u001B[1A\u001B[2K${renderOne(report)}\n`);
    reports.push(report);
  };

  const since = Date.now();

  await run("the model catalogue matches the gateway", async () =>
    routerKey === undefined
      ? missing(
          "the model catalogue matches the gateway",
          "RAMP_ROUTER_API_KEY",
        )
      : await checkCatalogueDrift(routerKey),
  );

  await run("the catalogue is imported", async () => {
    if (databaseUrl === undefined) {
      return missing("the catalogue is imported", "DATABASE_URL");
    }
    const db = createDb({ endpoint: "pooled", url: databaseUrl });
    try {
      return await checkCatalogue(async (table) => {
        // The table names come from this file, never from input, which is the
        // only way an identifier may vary at all.
        const sql =
          table === "authors"
            ? "SELECT count(*)::int AS n FROM authors"
            : "SELECT count(*)::int AS n FROM catalogue_works";
        const result = await db.query<{ n: number }>(sql);
        return result.rows[0]?.n ?? 0;
      });
    } finally {
      await db.close();
    }
  });

  await run("the gateway accepts every stage schema", async () =>
    routerKey === undefined
      ? missing("the gateway accepts every stage schema", "RAMP_ROUTER_API_KEY")
      : await checkStageSchemas(routerKey),
  );

  // Named as the slow one, because it is: a model call that generates a whole
  // card, and the only check here measured in tens of seconds.
  await run(
    "a real model satisfies the extraction contract (one model call, ~1 min)",
    async () =>
      routerKey === undefined
        ? missing(
            "a real model satisfies the extraction contract",
            "RAMP_ROUTER_API_KEY",
          )
        : await checkExtraction(routerKey),
  );

  await run("the latinate classifier's precision", async () =>
    unchecked(
      "the latinate classifier's precision",
      "The hand-labelled set it scores against does not exist yet.",
      "bun scripts/score-latinate.ts <labelled.json>",
    ),
  );

  await run("LISTEN/NOTIFY on the direct endpoint", async () =>
    directUrl === undefined
      ? missing("LISTEN/NOTIFY on the direct endpoint", "DATABASE_URL_DIRECT")
      : await checkListenNotify(directUrl),
  );

  const seconds = ((Date.now() - since) / 1000).toFixed(1);
  process.stdout.write(
    `\n${
      reports.every((report) => report.ok)
        ? `All ${reports.length.toString()} checks passed. Every declared value was right.`
        : `${reports.filter((report) => !report.ok).length.toString()} of ${reports.length.toString()} checks found something. Each lands as its own follow-up PR.`
    }\nin ${seconds}s\n`,
  );
  process.exit(exitCodeFor(reports));
}
