import type { LengthPreset, Session, Step } from "@auteur/core/session";
import type { Db } from "@auteur/db/db";
import { columns, maybeRow, oneRow } from "@auteur/db/sql";
import { AuteurError } from "@auteur/errors/auteur-error";

/**
 * Sessions: the wizard's state, and nothing else.
 *
 * The store returns domain types, not rows. Every column that the schema
 * constrains with a `CHECK` maps onto a TypeScript union in `@auteur/core`, so
 * a value that reaches here has already been narrowed — the `CHECK` is the
 * second line, not the first.
 */

type Row = {
  id: string;
  step: Step;
  idea: string;
  constraints: string | null;
  length_preset: LengthPreset;
  author_id: string | null;
  card_id: string | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS = [
  "id",
  "step",
  "idea",
  "constraints",
  "length_preset",
  "author_id",
  "card_id",
  "created_at",
  "updated_at",
];

const toSession = (row: Row): Session => ({
  authorId: row["author_id"],
  cardId: row["card_id"],
  constraints: row["constraints"],
  createdAt: row["created_at"],
  id: row["id"],
  idea: row["idea"],
  lengthPreset: row["length_preset"],
  step: row["step"],
  updatedAt: row["updated_at"],
});

export const createSession = async (
  db: Db,
  session: {
    readonly id: string;
    readonly idea: string;
    readonly lengthPreset: LengthPreset;
    readonly constraints?: string | null;
  },
): Promise<Session> => {
  const result = await db.query<Row>(
    `INSERT INTO sessions (id, step, idea, constraints, length_preset)
     VALUES ($1, 'idea', $2, $3, $4)
     RETURNING ${columns(COLUMNS)}`,
    [
      session.id,
      session.idea,
      session.constraints ?? null,
      session.lengthPreset,
    ],
  );
  return toSession(oneRow(result.rows, "the session just created"));
};

export const findSession = async (
  db: Db,
  id: string,
): Promise<Session | undefined> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM sessions WHERE id = $1`,
    [id],
  );
  const row = maybeRow(result.rows);
  return row === undefined ? undefined : toSession(row);
};

export const requireSession = async (db: Db, id: string): Promise<Session> => {
  const session = await findSession(db, id);
  if (session === undefined) {
    throw new AuteurError("not_found", `Session ${id} does not exist.`);
  }
  return session;
};

export type SessionPatch = {
  readonly step?: Step;
  readonly idea?: string;
  readonly constraints?: string | null;
  readonly lengthPreset?: LengthPreset;
  readonly authorId?: string | null;
  readonly cardId?: string | null;
};

/**
 * Update the fields the caller named, and only those.
 *
 * Absent-versus-null matters: `authorId: null` clears the author, and omitting
 * `authorId` leaves it alone. A store that took a whole `Session` and wrote
 * every column would make "change the preset" silently overwrite the card the
 * research stage resolved a moment earlier.
 *
 * Written as **one static statement** with a present/value parameter pair per
 * field, rather than a `SET` list assembled from the patch's keys. The
 * assembled form is a different statement text per combination of fields — a
 * dozen entries in the plan cache for one operation — and it puts a
 * concatenation inside a SQL string, which is the shape gate 13 exists to
 * refuse. `CASE WHEN $n THEN $n+1 ELSE column END` says the same thing with
 * nothing interpolated.
 */
export const updateSession = async (
  db: Db,
  id: string,
  patch: SessionPatch,
): Promise<Session> => {
  const has = (key: keyof SessionPatch): boolean => Object.hasOwn(patch, key);
  const result = await db.query<Row>(
    `UPDATE sessions SET
       step          = CASE WHEN $2  THEN $3::text    ELSE step          END,
       idea          = CASE WHEN $4  THEN $5::text    ELSE idea          END,
       constraints   = CASE WHEN $6  THEN $7::text    ELSE constraints   END,
       length_preset = CASE WHEN $8  THEN $9::text    ELSE length_preset END,
       author_id     = CASE WHEN $10 THEN $11::text   ELSE author_id     END,
       card_id       = CASE WHEN $12 THEN $13::uuid   ELSE card_id       END,
       -- Only when the patch named something. A re-entered step that changes
       -- nothing must leave the session untouched, and this column is what the
       -- rail reads to decide whether a row moved.
       updated_at    = CASE WHEN $2 OR $4 OR $6 OR $8 OR $10 OR $12
                            THEN now() ELSE updated_at END
     WHERE id = $1
     RETURNING ${columns(COLUMNS)}`,
    [
      id,
      has("step"),
      patch.step ?? null,
      has("idea"),
      patch.idea ?? null,
      has("constraints"),
      patch.constraints ?? null,
      has("lengthPreset"),
      patch.lengthPreset ?? null,
      has("authorId"),
      patch.authorId ?? null,
      has("cardId"),
      patch.cardId ?? null,
    ],
  );
  const row = maybeRow(result.rows);
  if (row === undefined) {
    throw new AuteurError("not_found", `Session ${id} does not exist.`);
  }
  return toSession(row);
};
