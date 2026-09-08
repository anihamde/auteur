import type { Db } from "@auteur/db/db";

/**
 * Per-session model pins, `ARCHITECTURE.md` §6.3.
 *
 * A pin is a session's choice for one stage; the absence of a pin means tier
 * resolution decides. The two are not the same as "pinned to the resolved
 * model": a pin survives a change to the tier candidate lists and a resolution
 * does not, which is the whole reason a reader pins one.
 *
 * The write is all-or-nothing (§6.3's "one model for every stage" path writes
 * seven at once) — a half-applied pin set would leave a pipeline running two
 * models the reader never chose together.
 */

export const readPins = async (
  db: Db,
  sessionId: string,
): Promise<Map<string, string>> => {
  const result = await db.query<{ stage_id: string; model_id: string }>(
    `SELECT stage_id, model_id FROM stage_pins WHERE session_id = $1`,
    [sessionId],
  );
  return new Map(result.rows.map((row) => [row["stage_id"], row["model_id"]]));
};

/**
 * Replace the session's pins with exactly this set.
 *
 * In one transaction, so a caller cannot observe the delete without the
 * insert. Replacing rather than merging is what makes "unpin this stage" a
 * write of the remaining pins rather than a second endpoint.
 */
export const putPins = async (
  db: Db,
  sessionId: string,
  pins: ReadonlyMap<string, string>,
): Promise<void> => {
  await db.transaction(async (client) => {
    await client.query(`DELETE FROM stage_pins WHERE session_id = $1`, [
      sessionId,
    ]);
    if (pins.size === 0) return;
    await client.query(
      `INSERT INTO stage_pins (session_id, stage_id, model_id)
       SELECT $1, * FROM unnest($2::text[], $3::text[])`,
      [sessionId, [...pins.keys()], [...pins.values()]],
    );
  });
};
