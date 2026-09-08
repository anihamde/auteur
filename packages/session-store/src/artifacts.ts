import type { ArtifactKind } from "@auteur/core/session";
import type { Db } from "@auteur/db/db";
import { columns, maybeRow } from "@auteur/db/sql";

/**
 * Artifacts, and staleness as a computed fact.
 *
 * `ARCHITECTURE.md` §7.5: every artifact stores the hash of the inputs it was
 * produced from, and it is stale when that hash no longer matches. There is no
 * `stale` column and there must not be one — a flag has to be set by whoever
 * invalidates, which means seven `if` statements and one of them wrong. A
 * comparison cannot be forgotten.
 *
 * So this store has no `markStale`. It has `readFresh`, which takes the key the
 * caller expects and returns the row only if it matches.
 */

export type StoredArtifact<Body = unknown> = {
  readonly sessionId: string;
  readonly kind: ArtifactKind;
  readonly inputKey: string;
  readonly body: Body;
  readonly createdAt: Date;
};

type Row = {
  session_id: string;
  kind: ArtifactKind;
  input_key: string;
  body: unknown;
  created_at: Date;
};

const COLUMNS = ["session_id", "kind", "input_key", "body", "created_at"];

const toArtifact = <Body>(row: Row): StoredArtifact<Body> => ({
  body: row["body"] as Body,
  createdAt: row["created_at"],
  inputKey: row["input_key"],
  kind: row["kind"],
  sessionId: row["session_id"],
});

/** Write an artifact, replacing whatever was there for that `(session, kind)`. */
export const putArtifact = async (
  db: Db,
  artifact: {
    readonly sessionId: string;
    readonly kind: ArtifactKind;
    readonly inputKey: string;
    readonly body: unknown;
  },
): Promise<void> => {
  await db.query(
    `INSERT INTO artifacts (session_id, kind, input_key, body)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (session_id, kind) DO UPDATE
       SET input_key = EXCLUDED.input_key,
           body = EXCLUDED.body,
           created_at = now()`,
    [
      artifact.sessionId,
      artifact.kind,
      artifact.inputKey,
      JSON.stringify(artifact.body),
    ],
  );
};

/** Whatever is stored, fresh or not. The report and the export read this. */
export const findArtifact = async <Body>(
  db: Db,
  sessionId: string,
  kind: ArtifactKind,
): Promise<StoredArtifact<Body> | undefined> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM artifacts
      WHERE session_id = $1 AND kind = $2`,
    [sessionId, kind],
  );
  const row = maybeRow(result.rows);
  return row === undefined ? undefined : toArtifact<Body>(row);
};

/**
 * The artifact, only if it was produced from these exact inputs.
 *
 * This is the whole of `POST /advance`'s "skip the stages that are still
 * current": a hit means the stage does not run, and a miss means it does. The
 * comparison is in the `WHERE` clause rather than in TypeScript so a caller
 * cannot read the row, forget to compare, and serve a stale outline.
 */
export const readFresh = async <Body>(
  db: Db,
  sessionId: string,
  kind: ArtifactKind,
  inputKey: string,
): Promise<StoredArtifact<Body> | undefined> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM artifacts
      WHERE session_id = $1 AND kind = $2 AND input_key = $3`,
    [sessionId, kind, inputKey],
  );
  const row = maybeRow(result.rows);
  return row === undefined ? undefined : toArtifact<Body>(row);
};

/** The stored key for a kind, for building a dependent stage's input key. */
export const inputKeyOf = async (
  db: Db,
  sessionId: string,
  kind: ArtifactKind,
): Promise<string | undefined> => {
  const result = await db.query<{ input_key: string }>(
    `SELECT input_key FROM artifacts WHERE session_id = $1 AND kind = $2`,
    [sessionId, kind],
  );
  return maybeRow(result.rows)?.["input_key"];
};
