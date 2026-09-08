import type { Db } from "@auteur/db/db";
import { columns, maybeRow } from "@auteur/db/sql";

/**
 * The authors cache.
 *
 * An author id is minted by the provider (`gutenberg:<slug>-<birthYear>`) and
 * is never a generated uuid, so the same upstream author resolves to the same
 * row across sessions and machines. That is what makes a card cache hit
 * possible at all.
 */

export type AuthorKind = "full-text" | "secondary";

export type StoredAuthor = {
  readonly id: string;
  readonly provider: "gutenberg";
  readonly kind: AuthorKind;
  readonly displayName: string;
  readonly birthYear: number | null;
  readonly deathYear: number | null;
  readonly workCount: number;
  /** Null until a corpus has been assembled and counted. */
  readonly measuredWords: number | null;
  readonly fetchedAt: Date | null;
};

type Row = {
  id: string;
  provider: "gutenberg";
  kind: AuthorKind;
  display_name: string;
  birth_year: number | null;
  death_year: number | null;
  work_count: number;
  measured_words: number | null;
  fetched_at: Date | null;
};

const toAuthor = (row: Row): StoredAuthor => ({
  birthYear: row["birth_year"],
  deathYear: row["death_year"],
  displayName: row["display_name"],
  fetchedAt: row["fetched_at"],
  id: row["id"],
  kind: row["kind"],
  measuredWords: row["measured_words"],
  provider: row["provider"],
  workCount: row["work_count"],
});

const COLUMNS = [
  "id",
  "provider",
  "kind",
  "display_name",
  "birth_year",
  "death_year",
  "work_count",
  "measured_words",
  "fetched_at",
];

/**
 * Insert or refresh an author.
 *
 * Upsert rather than insert-if-absent: upstream metadata moves (a work count
 * grows, a death year is filled in) and the row should follow it. What must not
 * move is `measured_words`, which is this system's own measurement rather than
 * the provider's, so a refresh coalesces to the existing value.
 */
export const upsertAuthor = async (
  db: Db,
  author: Omit<StoredAuthor, "fetchedAt">,
): Promise<StoredAuthor> => {
  const result = await db.query<Row>(
    `INSERT INTO authors (id, provider, kind, display_name, birth_year,
                          death_year, work_count, measured_words, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (id) DO UPDATE SET
       kind = EXCLUDED.kind,
       display_name = EXCLUDED.display_name,
       birth_year = EXCLUDED.birth_year,
       death_year = EXCLUDED.death_year,
       work_count = EXCLUDED.work_count,
       measured_words = COALESCE(EXCLUDED.measured_words, authors.measured_words),
       fetched_at = now()
     RETURNING ${columns(COLUMNS)}`,
    [
      author.id,
      author.provider,
      author.kind,
      author.displayName,
      author.birthYear,
      author.deathYear,
      author.workCount,
      author.measuredWords,
    ],
  );
  const row = maybeRow(result.rows);
  if (row === undefined) {
    throw new Error("upsertAuthor returned no row");
  }
  return toAuthor(row);
};

export const findAuthor = async (
  db: Db,
  id: string,
): Promise<StoredAuthor | undefined> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM authors WHERE id = $1`,
    [id],
  );
  const row = maybeRow(result.rows);
  return row === undefined ? undefined : toAuthor(row);
};

/** Record the corpus size this system measured, not the one upstream claims. */
export const recordMeasuredWords = async (
  db: Db,
  id: string,
  words: number,
): Promise<void> => {
  await db.query(`UPDATE authors SET measured_words = $2 WHERE id = $1`, [
    id,
    words,
  ]);
};
