import {
  type RevisableStage,
  type RevisionNote,
  revisionNoteSchema,
} from "@auteur/core/session";
import type { Db } from "@auteur/db/db";
import { columns } from "@auteur/db/sql";

/**
 * What the reader said about a stage's output.
 *
 * The other thing a person puts into this pipeline is an answer to a question
 * it asked, and a question is closed: the model wrote it, the reader chose
 * among suggestions, and the answer means what the question meant. A note is
 * the opposite — it is about the beat sheet or the prose that already exists,
 * and nothing anticipated it.
 *
 * Rows accumulate and are never edited, which is what makes "and also" work
 * without a round counter: a reader who asks for a shorter middle and then for
 * a longer ending has said two things, and the stage reads both in order.
 *
 * **The order is `seq`, a sequence, and not `created_at`.** `now()` is the
 * transaction's clock and is identical for two inserts a microsecond apart, and
 * `newId()` is a millisecond-precision UUIDv7 with random bits below — so
 * ordering by either gives a stable order that is not the insertion order. The
 * prompt would then differ between runs with no note changing, which §7.5
 * cannot see: the note set is the same set.
 */

type Row = {
  id: string;
  session_id: string;
  stage_id: RevisableStage;
  note: string;
  created_at: Date;
};

/**
 * `seq` is read but never returned.
 *
 * It orders the rows and nothing else: a sequence number is a fact about this
 * table's insert history, and putting it in `RevisionNote` would make it
 * something a screen or a prompt could come to depend on.
 */
const COLUMNS = ["id", "session_id", "stage_id", "note", "created_at"];

/**
 * Parsed on the way out, not cast.
 *
 * `stage_id` is a `text` column with no CHECK behind it — the revisable set is
 * a product decision that changes with the pipeline, and a constraint would
 * make changing it a migration. So the narrowing happens here, where a row
 * written by an older shape becomes a parse failure rather than a stage id
 * nothing dispatches on.
 */
const toNote = (row: Row): RevisionNote =>
  revisionNoteSchema.parse({
    createdAt: row["created_at"],
    id: row["id"],
    note: row["note"],
    sessionId: row["session_id"],
    stageId: row["stage_id"],
  });

export const addRevisionNote = async (
  db: Db,
  note: {
    readonly id: string;
    readonly sessionId: string;
    readonly stageId: RevisableStage;
    readonly note: string;
  },
): Promise<RevisionNote> => {
  const result = await db.query<Row>(
    `INSERT INTO revision_notes (id, session_id, stage_id, note)
     VALUES ($1, $2, $3, $4)
     RETURNING ${columns(COLUMNS)}`,
    [note.id, note.sessionId, note.stageId, note.note.trim()],
  );
  const row = result.rows[0];
  if (row === undefined) {
    // `INSERT ... RETURNING` with no conflict clause returns the row or throws.
    // Reaching here means the driver returned a shape this code cannot read,
    // and a silent `undefined` would become a note the reader believes was
    // filed.
    throw new Error("the insert returned no row");
  }
  return toNote(row);
};

/** One stage's notes, oldest first. */
export const listRevisionNotes = async (
  db: Db,
  sessionId: string,
  stageId: RevisableStage,
): Promise<RevisionNote[]> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM revision_notes
     WHERE session_id = $1 AND stage_id = $2
     ORDER BY seq`,
    [sessionId, stageId],
  );
  return result.rows.map(toNote);
};

/**
 * Every note on a session, grouped by stage.
 *
 * One round trip, because §7.5's staleness reads the notes of every stage at
 * once and a query per stage would be a query per stage on every advance.
 */
export const revisionNotesFor = async (
  db: Db,
  sessionId: string,
): Promise<Map<RevisableStage, RevisionNote[]>> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM revision_notes
     WHERE session_id = $1
     ORDER BY seq`,
    [sessionId],
  );
  const byStage = new Map<RevisableStage, RevisionNote[]>();
  for (const row of result.rows) {
    const note = toNote(row);
    const existing = byStage.get(note.stageId);
    if (existing === undefined) {
      byStage.set(note.stageId, [note]);
    } else {
      existing.push(note);
    }
  }
  return byStage;
};
