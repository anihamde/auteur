import type { Db } from "@auteur/db/db";

/**
 * Take the oldest queued row, or find there is none.
 *
 * The queue was drained by a caller that already knew which row it wanted: the
 * deployment invoked itself over HTTP naming a `queueId`, because a serverless
 * function cannot sit and watch a table. A worker can, and this is what it
 * watches with.
 *
 * **`FOR UPDATE SKIP LOCKED`.** Two workers polling the same table would
 * otherwise both read the same oldest row and one would lose the conditional
 * update — correct, and it wastes a round trip every tick. Skipping locked rows
 * makes the second worker take the *second* row instead of contending for the
 * first, which is what turns one worker into several without changing anything
 * else.
 *
 * It does not replace `claimStage`. That claims a row by id and is what
 * `POST /api/internal/stage` still uses; this claims whichever row is next.
 * Both are the same conditional update underneath — a row already claimed is
 * not claimed twice — so a worker and a hand-driven invocation can race safely.
 */

export type ClaimedRow = {
  readonly id: string;
  readonly sessionId: string;
  readonly stageId: string;
  readonly attempt: number;
};

type Row = {
  id: string;
  session_id: string;
  stage_id: string;
  attempt: number;
};

export const claimNext = async (
  db: Db,
  claimant: string,
): Promise<ClaimedRow | undefined> => {
  const result = await db.query<Row>(
    `UPDATE stage_queue
        SET status = 'claimed', claimed_by = $1, claimed_at = now()
      WHERE id = (
        SELECT id FROM stage_queue
         WHERE status = 'queued'
         ORDER BY enqueued_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, session_id, stage_id, attempt`,
    [claimant],
  );
  const row = result.rows[0];
  return row === undefined
    ? undefined
    : {
        attempt: row["attempt"],
        id: row["id"],
        sessionId: row["session_id"],
        stageId: row["stage_id"],
      };
};
