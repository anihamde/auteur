import type { Db } from "@auteur/db/db";
import { columns, maybeRow } from "@auteur/db/sql";

/**
 * The works cache, keyed by `(source_url, cleaner_version)`.
 *
 * That key is the whole design. Cleaning is what turns a Gutenberg download
 * into text a measurement can be trusted on, so a cleaner change invalidates
 * the stored text and requires re-fetching. Segmenting does not: it runs over
 * the stored text, so bumping the segmenter is free. Keying on the cleaner
 * alone is what keeps those two costs apart.
 */

export type StoredWork = {
  readonly id: string;
  readonly authorId: string;
  readonly title: string;
  readonly year: number | null;
  readonly language: string;
  readonly translator: string | null;
  readonly sourceUrl: string;
  readonly cleanerVersion: string;
  readonly wordCount: number;
  readonly text: string;
  readonly fetchedAt: Date;
};

type Row = {
  id: string;
  author_id: string;
  title: string;
  year: number | null;
  language: string;
  translator: string | null;
  source_url: string;
  cleaner_version: string;
  word_count: number;
  text: string;
  fetched_at: Date;
};

const COLUMNS = [
  "id",
  "author_id",
  "title",
  "year",
  "language",
  "translator",
  "source_url",
  "cleaner_version",
  "word_count",
  "text",
  "fetched_at",
];

const toWork = (row: Row): StoredWork => ({
  authorId: row["author_id"],
  cleanerVersion: row["cleaner_version"],
  fetchedAt: row["fetched_at"],
  id: row["id"],
  language: row["language"],
  sourceUrl: row["source_url"],
  text: row["text"],
  title: row["title"],
  translator: row["translator"],
  wordCount: row["word_count"],
  year: row["year"],
});

/**
 * The cached text for a source under a given cleaner, if there is one.
 *
 * A miss here is a fetch. A hit is why re-running a session against the same
 * author costs nothing.
 */
export const findWorkBySource = async (
  db: Db,
  sourceUrl: string,
  cleanerVersion: string,
): Promise<StoredWork | undefined> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM works
     WHERE source_url = $1 AND cleaner_version = $2`,
    [sourceUrl, cleanerVersion],
  );
  const row = maybeRow(result.rows);
  return row === undefined ? undefined : toWork(row);
};

export const listWorksByAuthor = async (
  db: Db,
  authorId: string,
  cleanerVersion: string,
): Promise<StoredWork[]> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM works
     WHERE author_id = $1 AND cleaner_version = $2
     ORDER BY id`,
    [authorId, cleanerVersion],
  );
  return result.rows.map(toWork);
};

/**
 * Store a fetched and cleaned work, or return the one already stored.
 *
 * `ON CONFLICT ... DO UPDATE` rather than `DO NOTHING` so the statement always
 * returns a row: with `DO NOTHING` a concurrent second fetch of the same work
 * gets an empty result and has to issue a second query to find out it lost the
 * race, which is a round-trip and a window in which it could find nothing.
 */
export const putWork = async (
  db: Db,
  work: Omit<StoredWork, "fetchedAt">,
): Promise<StoredWork> => {
  const result = await db.query<Row>(
    `INSERT INTO works (id, author_id, title, year, language, translator,
                        source_url, cleaner_version, word_count, text)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (source_url, cleaner_version) DO UPDATE
       SET fetched_at = works.fetched_at
     RETURNING ${columns(COLUMNS)}`,
    [
      work.id,
      work.authorId,
      work.title,
      work.year,
      work.language,
      work.translator,
      work.sourceUrl,
      work.cleanerVersion,
      work.wordCount,
      work.text,
    ],
  );
  const row = maybeRow(result.rows);
  if (row === undefined) {
    throw new Error("putWork returned no row");
  }
  return toWork(row);
};
