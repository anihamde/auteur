import type { Db } from "@auteur/db/db";
import { columns, maybeRow } from "@auteur/db/sql";

/**
 * The durable stage chain.
 *
 * There is no long-running process. A stage's last act is to enqueue the next
 * one; a one-minute cron sweep re-invokes whatever a lost invocation left
 * behind (`docs/ARCHITECTURE.md` §5.3). So the queue is the pipeline's control
 * flow, and the only thing standing between a lost invocation and a stage that
 * runs twice is the claim below.
 *
 * **Claiming is a conditional update, not a read then a write.** `UPDATE ...
 * WHERE status = 'queued' RETURNING` either changes a row or changes nothing,
 * decided by Postgres under row-level locking. A sweep racing a live stage
 * therefore cannot double-run it: the loser's `RETURNING` is empty. A
 * read-then-write, however carefully ordered, has a window between the two
 * statements where both callers have seen `queued`.
 */

export type QueueStatus = "queued" | "claimed" | "done" | "error";

export type QueueEntry = {
  readonly id: string;
  readonly sessionId: string;
  readonly stageId: string;
  readonly status: QueueStatus;
  readonly attempt: number;
  readonly claimedBy: string | null;
  readonly claimedAt: Date | null;
  readonly enqueuedAt: Date;
};

type Row = {
  id: string;
  session_id: string;
  stage_id: string;
  status: QueueStatus;
  attempt: number;
  claimed_by: string | null;
  claimed_at: Date | null;
  enqueued_at: Date;
};

const COLUMNS = [
  "id",
  "session_id",
  "stage_id",
  "status",
  "attempt",
  "claimed_by",
  "claimed_at",
  "enqueued_at",
];

const toEntry = (row: Row): QueueEntry => ({
  attempt: row["attempt"],
  claimedAt: row["claimed_at"],
  claimedBy: row["claimed_by"],
  enqueuedAt: row["enqueued_at"],
  id: row["id"],
  sessionId: row["session_id"],
  stageId: row["stage_id"],
  status: row["status"],
});

/**
 * How many times one stage may be released back to the queue before the queue
 * gives up on it. `ARCHITECTURE.md` §5.3's retry budget.
 */
export const MAX_ATTEMPTS = 3;

/**
 * Put a stage on the queue, and answer with the row that will actually run.
 *
 * The `(session_id, stage_id, attempt)` key makes this idempotent: a stage
 * whose last act is to enqueue the next cannot enqueue it twice when the
 * invocation is retried after its enqueue committed. **The conflict returns the
 * existing row rather than nothing**, because the caller's next act is to
 * invoke a queue id — and a caller handed `undefined` either skips the
 * invocation or, worse, invokes the id it minted, which names no row. The
 * platform then answers `claimed: false` and the stage waits for the sweep.
 *
 * `DO UPDATE` writing a column to its own value is how Postgres is asked for
 * `RETURNING` on a conflict. Nothing about the stored row changes.
 */
export const enqueueStage = async (
  db: Db,
  entry: {
    readonly id: string;
    readonly sessionId: string;
    readonly stageId: string;
    readonly attempt?: number;
  },
): Promise<QueueEntry> => {
  const result = await db.query<Row>(
    `INSERT INTO stage_queue (id, session_id, stage_id, status, attempt)
     VALUES ($1, $2, $3, 'queued', $4)
     ON CONFLICT (session_id, stage_id, attempt)
       DO UPDATE SET stage_id = stage_queue.stage_id
     RETURNING ${columns(COLUMNS)}`,
    [entry.id, entry.sessionId, entry.stageId, entry.attempt ?? 0],
  );
  const row = maybeRow(result.rows);
  if (row === undefined) {
    throw new Error("enqueueStage returned no row");
  }
  return toEntry(row);
};

/**
 * The row for a stage that is already going to run, if there is one.
 *
 * `queued` or `claimed` at any attempt. A `claimed` row is an invocation in
 * flight; a `queued` one is waiting for its invocation or for the sweep. Either
 * way the stage runs without anything further being enqueued, and enqueuing
 * anyway is how it would run twice.
 */
export const findLiveStage = async (
  db: Db,
  sessionId: string,
  stageId: string,
): Promise<QueueEntry | undefined> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM stage_queue
      WHERE session_id = $1 AND stage_id = $2
        AND status IN ('queued', 'claimed')
      ORDER BY attempt DESC
      LIMIT 1`,
    [sessionId, stageId],
  );
  const row = maybeRow(result.rows);
  return row === undefined ? undefined : toEntry(row);
};

/**
 * Ask a stage to run, whether or not it has run before, and answer with the row
 * that will run it.
 *
 * A re-run had no way to happen. `(session_id, stage_id, attempt)` is unique
 * and a stage that has run leaves an attempt-0 row behind, so restaling a stage
 * and enqueuing it hit that row and did nothing — the stage the session was
 * told would re-run never ran, and the run continued against whatever the
 * previous one left. Changing the author did exactly this.
 *
 * **A stage already going to run is left alone**, and its row is what comes
 * back. Not only because deleting a `claimed` row would strand the invocation
 * holding it — its `completeStage` would find nothing to complete — but because
 * a live row at attempt 1 sits beside the `error` row at attempt 0 that the
 * retry came from. Clearing that `error` row would free the attempt-0 key, and
 * the insert that follows would put a second live row beside the first: two
 * invocations of one stage, two model bills, two token streams interleaved on
 * one connection, and both writing the same artifact.
 *
 * Otherwise every finished row for the stage goes and a fresh attempt-0 row
 * takes its place — a full budget for the new run, rather than what the last
 * one had left.
 *
 * The queue is a work list, not a history. `stage_runs` records what ran, with
 * its attempt, its tokens and its cost, and is untouched by this.
 */
export const enqueueForRun = async (
  db: Db,
  entry: {
    readonly id: string;
    readonly sessionId: string;
    readonly stageId: string;
  },
): Promise<QueueEntry> => {
  const live = await findLiveStage(db, entry.sessionId, entry.stageId);
  if (live !== undefined) return live;

  await db.query(
    `DELETE FROM stage_queue
      WHERE session_id = $1 AND stage_id = $2
        AND status IN ('done', 'error')`,
    [entry.sessionId, entry.stageId],
  );
  return enqueueStage(db, entry);
};

/**
 * Take one queued row for `claimant`, or `undefined` if someone else has it.
 *
 * Exactly one of two concurrent callers gets the row. That is the property
 * every "did this stage run twice?" question reduces to.
 */
export const claimStage = async (
  db: Db,
  id: string,
  claimant: string,
): Promise<QueueEntry | undefined> => {
  const result = await db.query<Row>(
    `UPDATE stage_queue
        SET status = 'claimed', claimed_by = $2, claimed_at = now()
      WHERE id = $1 AND status = 'queued'
      RETURNING ${columns(COLUMNS)}`,
    [id, claimant],
  );
  const row = maybeRow(result.rows);
  return row === undefined ? undefined : toEntry(row);
};

/** Mark a claimed row finished. Only its own claimant may. */
export const completeStage = async (
  db: Db,
  id: string,
  claimant: string,
): Promise<boolean> => {
  const result = await db.query(
    `UPDATE stage_queue SET status = 'done'
      WHERE id = $1 AND status = 'claimed' AND claimed_by = $2`,
    [id, claimant],
  );
  return (result.rowCount ?? 0) === 1;
};

export type FailureOutcome =
  | { readonly outcome: "released"; readonly next: QueueEntry }
  | { readonly outcome: "failed" }
  | { readonly outcome: "not-claimed" };

/**
 * Give up on one attempt.
 *
 * Under the retry budget the stage is re-enqueued at `attempt + 1` — a **new
 * row**, not a reset of this one, so the queue keeps the history of what was
 * tried and the `(session_id, stage_id, attempt)` key still forbids a
 * duplicate. Past the budget the row is marked `error` and nothing is
 * re-enqueued: a stage that has failed three times fails the session rather
 * than looping until the cron sweep is turned off.
 */
export const failStage = async (
  db: Db,
  id: string,
  claimant: string,
  nextId: string,
): Promise<FailureOutcome> =>
  db.transaction(async (client) => {
    const claimed = await client.query<Row>(
      `UPDATE stage_queue SET status = 'error'
        WHERE id = $1 AND status = 'claimed' AND claimed_by = $2
        RETURNING ${columns(COLUMNS)}`,
      [id, claimant],
    );
    const row = claimed.rows[0];
    if (row === undefined) return { outcome: "not-claimed" };

    const attempt = row["attempt"] + 1;
    if (attempt >= MAX_ATTEMPTS) return { outcome: "failed" };

    const requeued = await client.query<Row>(
      `INSERT INTO stage_queue (id, session_id, stage_id, status, attempt)
       VALUES ($1, $2, $3, 'queued', $4)
       ON CONFLICT (session_id, stage_id, attempt) DO NOTHING
       RETURNING ${columns(COLUMNS)}`,
      [nextId, row["session_id"], row["stage_id"], attempt],
    );
    const next = requeued.rows[0];
    if (next === undefined) return { outcome: "failed" };
    return { next: toEntry(next), outcome: "released" };
  });

export const findQueueEntry = async (
  db: Db,
  id: string,
): Promise<QueueEntry | undefined> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM stage_queue WHERE id = $1`,
    [id],
  );
  const row = maybeRow(result.rows);
  return row === undefined ? undefined : toEntry(row);
};

export const listQueueForSession = async (
  db: Db,
  sessionId: string,
): Promise<QueueEntry[]> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM stage_queue WHERE session_id = $1
     ORDER BY enqueued_at, attempt`,
    [sessionId],
  );
  return result.rows.map(toEntry);
};
