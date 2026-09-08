#!/usr/bin/env bun
/**
 * `bun run stats` — §10's completion rate and time-to-draft.
 *
 * Two numbers, computed from what the pipeline already records rather than
 * from counters someone has to remember to increment. `sessions` says how many
 * runs were started; `stage_runs` and `events` say what happened in them.
 *
 * **Time-to-draft is measured to the first token, not to the finished draft.**
 * §10's target is about when a reader stops waiting, and that is when prose
 * starts appearing — a story that takes four more minutes to finish while they
 * read it has already met the claim.
 */
// A relative import rather than the workspace alias: `scripts/` is not a
// package and has no dependency on `@auteur/db`, and adding one would put a
// database driver in the root manifest for the sake of one command.
import { createDb, type Db } from "../packages/db/src/db.ts";

export type Stats = {
  readonly sessions: number;
  readonly reachedDraft: number;
  readonly completionRate: number;
  /** Milliseconds from `corpus-select` starting to the draft's first delta. */
  readonly timeToDraftMs: readonly number[];
  readonly medianTimeToDraftMs: number | undefined;
  readonly costMicros: number;
};

/** The middle value, or the mean of the two middles. */
export const median = (values: readonly number[]): number | undefined => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  const low = sorted[middle - 1];
  const high = sorted[middle];
  return low === undefined || high === undefined ? undefined : (low + high) / 2;
};

export const collect = async (db: Db): Promise<Stats> => {
  const sessions = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM sessions`,
  );

  // The two ends of the measurement, per session, in one query: the moment the
  // first research stage started, and the moment the first draft token landed.
  // A session missing either end is not counted — a run still in flight is not
  // a slow run, and averaging it in would report a number that improves when a
  // session is abandoned.
  const spans = await db.query<{ started: Date; first_delta: Date }>(
    `SELECT r.started_at AS started, d.created_at AS first_delta
       FROM (
         SELECT session_id, min(started_at) AS started_at
           FROM stage_runs WHERE stage_id = 'corpus-select'
          GROUP BY session_id
       ) r
       JOIN (
         SELECT session_id, min(created_at) AS created_at
           FROM events
          WHERE payload->>'type' = 'stage_delta'
            AND payload->>'stageId' = 'draft'
          GROUP BY session_id
       ) d ON d.session_id = r.session_id`,
  );

  const cost = await db.query<{ micros: string }>(
    `SELECT COALESCE(sum(cost_micros), 0)::text AS micros FROM stage_runs`,
  );

  const started = Number(sessions.rows[0]?.["n"] ?? "0");
  const timeToDraftMs = spans.rows.map(
    (row) => row["first_delta"].getTime() - row["started"].getTime(),
  );

  return {
    completionRate:
      started === 0
        ? 0
        : spans.rowCount === null
          ? 0
          : spans.rowCount / started,
    costMicros: Number(cost.rows[0]?.["micros"] ?? "0"),
    medianTimeToDraftMs: median(timeToDraftMs),
    reachedDraft: spans.rowCount ?? 0,
    sessions: started,
    timeToDraftMs,
  };
};

export const render = (stats: Stats): string =>
  [
    `sessions started: ${stats.sessions.toString()}`,
    `reached a draft:  ${stats.reachedDraft.toString()} (${(stats.completionRate * 100).toFixed(1)}%)`,
    `median time to first draft token: ${
      stats.medianTimeToDraftMs === undefined
        ? "no completed runs yet"
        : `${(stats.medianTimeToDraftMs / 1000).toFixed(1)}s`
    }`,
    `total spend: $${(stats.costMicros / 1_000_000).toFixed(2)}`,
  ].join("\n");

if (import.meta.main) {
  const url = Bun.env["DATABASE_URL"];
  if (url === undefined) {
    process.stderr.write("DATABASE_URL is unset. Run `bun run preflight`.\n");
    process.exit(1);
  }
  const db = createDb({ endpoint: "pooled", url });
  process.stdout.write(`${render(await collect(db))}\n`);
  await db.close();
}
