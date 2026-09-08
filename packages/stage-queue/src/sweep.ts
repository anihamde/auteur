import type { Db } from "@auteur/db/db";

/**
 * The one-minute cron sweep.
 *
 * A Vercel function can vanish mid-stage: the platform reclaims it, the region
 * fails over, the invocation times out. Nothing notices, because there is no
 * supervising process — so a claimed row that has stopped moving is the only
 * evidence that a stage was lost. The sweep looks for exactly that.
 *
 * The threshold is a wall-clock age on `claimed_at`, not a heartbeat. A
 * heartbeat needs the stage to keep writing, which is one more thing a lost
 * invocation cannot do, and it would make every long stage look alive right up
 * until it did not.
 */

export type StaleClaim = {
  readonly id: string;
  readonly sessionId: string;
  readonly stageId: string;
  readonly attempt: number;
  readonly claimedBy: string | null;
  readonly claimedAt: Date | null;
};

type Row = {
  id: string;
  session_id: string;
  stage_id: string;
  attempt: number;
  claimed_by: string | null;
  claimed_at: Date | null;
};

/**
 * How long a claim may sit before the sweep treats it as lost.
 *
 * Above the longest a stage is allowed to take, so a slow `draft` is never
 * swept out from under itself; the claim's own conditional update is what makes
 * the mistake survivable if it were.
 */
export const STALE_AFTER_SECONDS = 300;

/** Claims older than the threshold, and rows still queued and never claimed. */
export const findStaleClaims = async (
  db: Db,
  staleAfterSeconds: number = STALE_AFTER_SECONDS,
): Promise<StaleClaim[]> => {
  const result = await db.query<Row>(
    `SELECT id, session_id, stage_id, attempt, claimed_by, claimed_at
       FROM stage_queue
      WHERE status = 'claimed'
        AND claimed_at < now() - make_interval(secs => $1)
      ORDER BY claimed_at`,
    [staleAfterSeconds],
  );
  return result.rows.map((row) => ({
    attempt: row["attempt"],
    claimedAt: row["claimed_at"],
    claimedBy: row["claimed_by"],
    id: row["id"],
    sessionId: row["session_id"],
    stageId: row["stage_id"],
  }));
};

/**
 * Put a stale claim back on the queue, if it is still stale.
 *
 * The `claimed_at` guard is repeated in the `WHERE` clause rather than trusted
 * from the read: between `findStaleClaims` and this call the original
 * invocation may have come back to life and completed. Re-checking under the
 * update is what makes the sweep safe to run while stages are live.
 */
export const releaseStaleClaim = async (
  db: Db,
  id: string,
  staleAfterSeconds: number = STALE_AFTER_SECONDS,
): Promise<boolean> => {
  const result = await db.query(
    `UPDATE stage_queue
        SET status = 'queued', claimed_by = NULL, claimed_at = NULL
      WHERE id = $1 AND status = 'claimed'
        AND claimed_at < now() - make_interval(secs => $2)`,
    [id, staleAfterSeconds],
  );
  return (result.rowCount ?? 0) === 1;
};

/**
 * Rows that are still `queued` and have sat there.
 *
 * The other half of what a lost invocation leaves behind: `advance` enqueued
 * the row and then the request to run it never arrived — the platform dropped
 * it, the region failed over, the process died between the insert and the
 * fetch. There is no claim to age out, so the evidence is the enqueue time.
 *
 * The threshold is short, because nothing is running: a queued row that has
 * been queued for a minute is a minute of a reader watching a spinner.
 */
export const QUEUED_AFTER_SECONDS = 60;

export type AbandonedRow = {
  readonly id: string;
  readonly sessionId: string;
  readonly stageId: string;
  readonly attempt: number;
};

export const findAbandonedQueued = async (
  db: Db,
  queuedAfterSeconds: number = QUEUED_AFTER_SECONDS,
): Promise<AbandonedRow[]> => {
  const result = await db.query<{
    id: string;
    session_id: string;
    stage_id: string;
    attempt: number;
  }>(
    `SELECT id, session_id, stage_id, attempt
       FROM stage_queue
      WHERE status = 'queued'
        AND enqueued_at < now() - make_interval(secs => $1)
      ORDER BY enqueued_at`,
    [queuedAfterSeconds],
  );
  return result.rows.map((row) => ({
    attempt: row["attempt"],
    id: row["id"],
    sessionId: row["session_id"],
    stageId: row["stage_id"],
  }));
};

/**
 * Give up on a claim that has exhausted the retry budget.
 *
 * Re-checked under the update for the same reason `releaseStaleClaim` is: the
 * original invocation may have finished in between, and a sweep that failed a
 * completed stage would be worse than one that did nothing.
 */
export const abandonStaleClaim = async (
  db: Db,
  id: string,
  staleAfterSeconds: number = STALE_AFTER_SECONDS,
): Promise<boolean> => {
  const result = await db.query(
    `UPDATE stage_queue SET status = 'error'
      WHERE id = $1 AND status = 'claimed'
        AND claimed_at < now() - make_interval(secs => $2)`,
    [id, staleAfterSeconds],
  );
  return (result.rowCount ?? 0) === 1;
};
