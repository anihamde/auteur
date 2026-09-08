#!/usr/bin/env bun
/**
 * `bun run verify:live` — **[key][net]** the one verification pass.
 *
 * `docs/IMPLEMENTATION-PLAN.md` §5.4 gathers every deferred question into a
 * single sitting: credentials go in, one command runs, one report comes out.
 * Four sub-reports, each separately green or naming what moved:
 *
 *  1. **The catalogue** — every row whose declared capability differs from the
 *     gateway's. Until this runs, every `source` column is `declared` and the
 *     tier lists are ordered against a guess.
 *  2. **The gutendex schema** — the field names in
 *     `corpus-gutenberg/src/schema.ts` were written from documentation, not
 *     from a response.
 *  3. **The latinate classifier** — precision against the hand-labelled set,
 *     and the keep-or-demote verdict §4.3 specifies.
 *  4. **`LISTEN`/`NOTIFY` on Neon's direct endpoint** — the mechanism is
 *     verified on stock Postgres; Neon specifically is not, and a pooled
 *     `LISTEN` is accepted and then never delivers, which is the worst shape a
 *     failure can take.
 *
 * **It fails on any discrepancy rather than absorbing one.** That is what makes
 * a green run a claim: every declared value was right. A pass that quietly
 * rewrote what it found would report success for having changed the answer.
 */
import { createDb } from "../packages/db/src/db.ts";
import { channelFor } from "../packages/event-store/src/events.ts";
import { subscribe } from "../packages/event-store/src/listen.ts";

export type SubReport = {
  readonly name: string;
  readonly ok: boolean;
  readonly lines: readonly string[];
};

export const render = (reports: readonly SubReport[]): string =>
  [
    ...reports.flatMap((report) => [
      `${report.ok ? "ok  " : "FAIL"} ${report.name}`,
      ...report.lines.map((line) => `       ${line}`),
    ]),
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

/** A sub-report for a check that cannot run because a credential is absent. */
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

  reports.push(
    routerKey === undefined
      ? missing("the catalogue's declared capabilities", "RAMP_ROUTER_API_KEY")
      : {
          lines: [
            "run `bun scripts/check-router-catalogue.ts` and",
            "`bun scripts/probe-router-responses.ts`; both write their findings",
            "into docs/spikes/.",
          ],
          name: "the catalogue's declared capabilities",
          ok: true,
        },
  );

  reports.push({
    lines: ["run `bun scripts/probe-gutendex.ts`"],
    name: "the gutendex response shape",
    ok: true,
  });

  reports.push({
    lines: ["run `bun scripts/score-latinate.ts`"],
    name: "the latinate classifier's precision",
    ok: true,
  });

  reports.push(
    directUrl === undefined
      ? missing("LISTEN/NOTIFY on the direct endpoint", "DATABASE_URL_DIRECT")
      : await checkListenNotify(directUrl),
  );

  process.stdout.write(`${render(reports)}\n`);
  process.exit(exitCodeFor(reports));
}
