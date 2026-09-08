import type { Db } from "@auteur/db/db";
import { columns, maybeRow } from "@auteur/db/sql";

/**
 * The run claim, and the cancel flag.
 *
 * One row per session with a run in flight. It exists for one property: a
 * double-clicked "advance" must not run the pipeline twice against one event
 * log. Two appends racing would produce interleaved events under one `seq`
 * sequence, and a client replaying them would see one incoherent run rather
 * than two.
 *
 * Cancellation is a flag rather than a signal because there is nothing to
 * signal: stages run in separate function invocations with no channel between
 * them. Each stage reads the flag at its boundaries, and the sweep and the
 * queue do the rest.
 */

export type RunStatus = "running" | "done" | "error" | "cancelled";

export type SessionRun = {
  readonly sessionId: string;
  readonly claimedBy: string;
  readonly status: RunStatus;
  readonly cancelRequested: boolean;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
};

type Row = {
  session_id: string;
  claimed_by: string;
  status: RunStatus;
  cancel_requested: boolean;
  started_at: Date;
  finished_at: Date | null;
};

const COLUMNS = [
  "session_id",
  "claimed_by",
  "status",
  "cancel_requested",
  "started_at",
  "finished_at",
];

const toRun = (row: Row): SessionRun => ({
  cancelRequested: row["cancel_requested"],
  claimedBy: row["claimed_by"],
  finishedAt: row["finished_at"],
  sessionId: row["session_id"],
  startedAt: row["started_at"],
  status: row["status"],
});

/**
 * Claim the session for a run, or return `undefined` if one is already in
 * flight.
 *
 * The `WHERE` clause on the `DO UPDATE` is what makes this a claim rather than
 * an overwrite: a finished run's row is taken over, a running one is not, and
 * Postgres decides which under row-level locking. The loser's `RETURNING` is
 * empty, so there is no window in which both callers believe they won.
 */
export const claimRun = async (
  db: Db,
  sessionId: string,
  claimant: string,
): Promise<SessionRun | undefined> => {
  const result = await db.query<Row>(
    `INSERT INTO session_runs (session_id, claimed_by, status)
     VALUES ($1, $2, 'running')
     ON CONFLICT (session_id) DO UPDATE
       SET claimed_by = EXCLUDED.claimed_by,
           status = 'running',
           cancel_requested = false,
           started_at = now(),
           finished_at = NULL
       WHERE session_runs.status <> 'running'
     RETURNING ${columns(COLUMNS)}`,
    [sessionId, claimant],
  );
  const row = maybeRow(result.rows);
  return row === undefined ? undefined : toRun(row);
};

/** Finish a run. Only its own claimant may. */
export const finishRun = async (
  db: Db,
  sessionId: string,
  claimant: string,
  status: Exclude<RunStatus, "running">,
): Promise<boolean> => {
  const result = await db.query(
    `UPDATE session_runs SET status = $3, finished_at = now()
      WHERE session_id = $1 AND claimed_by = $2 AND status = 'running'`,
    [sessionId, claimant, status],
  );
  return (result.rowCount ?? 0) === 1;
};

/**
 * Ask a running pipeline to stop.
 *
 * Sets the flag; it does not set the status. A run that is cancelled the
 * instant before it finishes should record what actually happened, and only the
 * run itself knows that.
 */
export const requestCancel = async (
  db: Db,
  sessionId: string,
): Promise<boolean> => {
  const result = await db.query(
    `UPDATE session_runs SET cancel_requested = true
      WHERE session_id = $1 AND status = 'running'`,
    [sessionId],
  );
  return (result.rowCount ?? 0) === 1;
};

export const findRun = async (
  db: Db,
  sessionId: string,
): Promise<SessionRun | undefined> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM session_runs WHERE session_id = $1`,
    [sessionId],
  );
  const row = maybeRow(result.rows);
  return row === undefined ? undefined : toRun(row);
};

/** Read the cancel flag at a stage boundary. */
export const isCancelRequested = async (
  db: Db,
  sessionId: string,
): Promise<boolean> => {
  const result = await db.query<{ cancel_requested: boolean }>(
    `SELECT cancel_requested FROM session_runs WHERE session_id = $1`,
    [sessionId],
  );
  return maybeRow(result.rows)?.["cancel_requested"] ?? false;
};
