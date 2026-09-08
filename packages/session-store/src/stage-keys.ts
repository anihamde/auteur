import type { Db } from "@auteur/db/db";
import { columns } from "@auteur/db/sql";

/**
 * The key each stage last completed with.
 *
 * `ARCHITECTURE.md` §7.5 makes staleness a comparison rather than a flag, and
 * the comparison needs a previous key to compare against. `artifacts.input_key`
 * supplies one for the four kinds that produce a document; this table supplies
 * one for all ten stages, so no stage is a special case. See
 * `docs/decisions/0006-staleness-needs-a-per-stage-key-table.md`.
 *
 * There is no `clearStageKey`, deliberately. Invalidation is a key that no
 * longer matches, never a row somebody has to remember to delete.
 */

export type StageKey = {
  readonly stageId: string;
  readonly inputKey: string;
  readonly completedAt: Date;
};

type Row = { stage_id: string; input_key: string; completed_at: Date };

const COLUMNS = ["stage_id", "input_key", "completed_at"];

/**
 * Record that a stage completed with this key.
 *
 * Written by the stage as its last act, in the transaction that records its
 * output — so a stage whose output was written and whose key was not cannot
 * exist, which would otherwise present as a stage that reruns for ever.
 */
export const recordStageKey = async (
  db: Db,
  sessionId: string,
  stageId: string,
  inputKey: string,
): Promise<void> => {
  await db.query(
    `INSERT INTO stage_keys (session_id, stage_id, input_key)
     VALUES ($1, $2, $3)
     ON CONFLICT (session_id, stage_id) DO UPDATE
       SET input_key = EXCLUDED.input_key, completed_at = now()`,
    [sessionId, stageId, inputKey],
  );
};

/** Every completed stage's key, by stage id. */
export const readStageKeys = async (
  db: Db,
  sessionId: string,
): Promise<Map<string, string>> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM stage_keys WHERE session_id = $1`,
    [sessionId],
  );
  return new Map(result.rows.map((row) => [row["stage_id"], row["input_key"]]));
};
