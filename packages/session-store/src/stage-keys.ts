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
  /** What the stage produced, when it produced something small. Decision 0007. */
  readonly output: unknown;
};

type Row = {
  stage_id: string;
  input_key: string;
  completed_at: Date;
  output: unknown;
};

const COLUMNS = ["stage_id", "input_key", "completed_at", "output"];

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
  output?: unknown,
): Promise<void> => {
  await db.query(
    `INSERT INTO stage_keys (session_id, stage_id, input_key, output)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (session_id, stage_id) DO UPDATE
       SET input_key = EXCLUDED.input_key,
           output = EXCLUDED.output,
           completed_at = now()`,
    [
      sessionId,
      stageId,
      inputKey,
      output === undefined ? null : JSON.stringify(output),
    ],
  );
};

/**
 * What a stage produced, parsed against the schema that stage declares.
 *
 * Parsed and not cast: the row came back over a connection, written by a
 * version of this code that may not be this one. A stage whose output no longer
 * matches its schema is a real failure, and turning it into `undefined` would
 * present as the upstream stage never having run.
 */
export const readStageOutput = async <Value>(
  db: Db,
  sessionId: string,
  stageId: string,
  parse: (value: unknown) => Value,
): Promise<Value | undefined> => {
  const result = await db.query<{ output: unknown }>(
    `SELECT output FROM stage_keys WHERE session_id = $1 AND stage_id = $2`,
    [sessionId, stageId],
  );
  const row = result.rows[0];
  if (row === undefined || row["output"] === null) return undefined;
  return parse(row["output"]);
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
