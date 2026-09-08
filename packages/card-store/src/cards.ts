import type { StyleCard } from "@auteur/core/style-card";
import type { Db } from "@auteur/db/db";
import { columns, maybeRow } from "@auteur/db/sql";

/**
 * The style-card cache, versioned per author.
 *
 * Two rules from `ARCHITECTURE.md` §4.4, and everything here is one of them:
 *
 * - **A cache hit is a `build_key` match**, returning the existing row. Same
 *   author, same works, same toolchain, same prompt, same model: same card.
 * - **A miss inserts `version = max(version) + 1`** for that author, so the
 *   UI's `borges@3` is a real identity and an older session keeps pointing at
 *   the card it was built with. Cards are never updated in place.
 */

export type CardProvenance = "full-text" | "secondary";

export type StoredCard = {
  readonly id: string;
  readonly authorId: string;
  readonly version: number;
  readonly buildKey: string;
  readonly provenance: CardProvenance;
  readonly confidence: number;
  readonly card: StyleCard;
  readonly builtAt: Date;
};

type Row = {
  id: string;
  author_id: string;
  version: number;
  build_key: string;
  provenance: CardProvenance;
  confidence: number;
  card: StyleCard;
  built_at: Date;
};

const COLUMNS = [
  "id",
  "author_id",
  "version",
  "build_key",
  "provenance",
  "confidence",
  "card",
  "built_at",
];

const toCard = (row: Row): StoredCard => ({
  authorId: row["author_id"],
  buildKey: row["build_key"],
  builtAt: row["built_at"],
  card: row["card"],
  confidence: row["confidence"],
  id: row["id"],
  provenance: row["provenance"],
  version: row["version"],
});

export const findCardByBuildKey = async (
  db: Db,
  buildKey: string,
): Promise<StoredCard | undefined> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM style_cards WHERE build_key = $1`,
    [buildKey],
  );
  const row = maybeRow(result.rows);
  return row === undefined ? undefined : toCard(row);
};

export const findCard = async (
  db: Db,
  id: string,
): Promise<StoredCard | undefined> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM style_cards WHERE id = $1`,
    [id],
  );
  const row = maybeRow(result.rows);
  return row === undefined ? undefined : toCard(row);
};

export const latestCardForAuthor = async (
  db: Db,
  authorId: string,
): Promise<StoredCard | undefined> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM style_cards
      WHERE author_id = $1 ORDER BY version DESC LIMIT 1`,
    [authorId],
  );
  const row = maybeRow(result.rows);
  return row === undefined ? undefined : toCard(row);
};

export type CardWrite = {
  readonly id: string;
  readonly authorId: string;
  readonly buildKey: string;
  readonly provenance: CardProvenance;
  readonly confidence: number;
  readonly card: StyleCard;
};

export type CardOutcome = {
  readonly card: StoredCard;
  /** False when an identical build already existed. §4.4's cache hit. */
  readonly inserted: boolean;
};

/**
 * Store a newly built card, or hand back the identical one already stored.
 *
 * The version is `max(version) + 1` **computed inside the insert**, not read
 * first and passed in: two research stages finishing together would otherwise
 * both read 3 and both try to write 4, and the `(author_id, version)`
 * constraint would fail one of them for no reason a user could act on.
 *
 * `ON CONFLICT (build_key) DO NOTHING` makes the identical-inputs case a hit
 * rather than an error, and the follow-up read is only issued when the insert
 * returned nothing — so the hot path is one round trip and the contended one is
 * two.
 */
export const putCard = async (
  db: Db,
  write: CardWrite,
): Promise<CardOutcome> => {
  const inserted = await db.query<Row>(
    `INSERT INTO style_cards
       (id, author_id, version, build_key, provenance, confidence, card)
     SELECT $1, $2,
            COALESCE((SELECT max(version) FROM style_cards WHERE author_id = $2), 0) + 1,
            $3, $4, $5, $6::jsonb
     ON CONFLICT (build_key) DO NOTHING
     RETURNING ${columns(COLUMNS)}`,
    [
      write.id,
      write.authorId,
      write.buildKey,
      write.provenance,
      write.confidence,
      JSON.stringify(write.card),
    ],
  );
  const row = maybeRow(inserted.rows);
  if (row !== undefined) {
    return { card: toCard(row), inserted: true };
  }

  const existing = await findCardByBuildKey(db, write.buildKey);
  if (existing === undefined) {
    // The conflict fired, so a row with this build key existed a moment ago and
    // nothing deletes cards. Reaching here means the invariant is broken, and
    // reporting that beats returning a card the caller did not build.
    throw new Error(
      `style_cards conflicted on build_key ${write.buildKey} but no row carries it`,
    );
  }
  return { card: existing, inserted: false };
};
