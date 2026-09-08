import type { CardOverlay } from "@auteur/core/style-card";
import type { Db } from "@auteur/db/db";
import { maybeRow } from "@auteur/db/sql";

/**
 * A session's edits to the card it resolved.
 *
 * Kept as an overlay rather than written into the card, because a card is
 * immutable and shared: `borges@3` is one row, and a session that reworded its
 * voice line must not change what another session sees. The overlay is
 * per-session by primary key, so there is exactly one and it cascades with the
 * session.
 *
 * The overlay is also what makes an `edited` origin honest — the card's own
 * claims keep their `measured` or `derived` origin and their citations, and the
 * edit sits beside them rather than overwriting the provenance.
 */

type Row = { session_id: string; card_id: string; fields: CardOverlay };

export type StoredOverlay = {
  readonly sessionId: string;
  readonly cardId: string;
  readonly fields: CardOverlay;
};

const toOverlay = (row: Row): StoredOverlay => ({
  cardId: row["card_id"],
  fields: row["fields"],
  sessionId: row["session_id"],
});

export const findOverlay = async (
  db: Db,
  sessionId: string,
): Promise<StoredOverlay | undefined> => {
  const result = await db.query<Row>(
    `SELECT session_id, card_id, fields FROM card_overlays
      WHERE session_id = $1`,
    [sessionId],
  );
  const row = maybeRow(result.rows);
  return row === undefined ? undefined : toOverlay(row);
};

export const putOverlay = async (
  db: Db,
  overlay: StoredOverlay,
): Promise<void> => {
  await db.query(
    `INSERT INTO card_overlays (session_id, card_id, fields)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (session_id) DO UPDATE
       SET card_id = EXCLUDED.card_id, fields = EXCLUDED.fields`,
    [overlay.sessionId, overlay.cardId, JSON.stringify(overlay.fields)],
  );
};

/** Drop the overlay, which is what "revert to the card" does. */
export const clearOverlay = async (
  db: Db,
  sessionId: string,
): Promise<boolean> => {
  const result = await db.query(
    `DELETE FROM card_overlays WHERE session_id = $1`,
    [sessionId],
  );
  return (result.rowCount ?? 0) === 1;
};
