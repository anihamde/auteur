import type { Db } from "@auteur/db/db";

/**
 * A book the catalogue knows about, before anything has been downloaded.
 *
 * The shape `corpus-select` offers a model and `work-fetch` downloads. It
 * carries its own `sourceUrl` because the catalogue derives one per book and
 * the fetcher no longer has a formats map to choose from.
 */
export type CorpusCandidate = {
  readonly id: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly translator: string | null;
};

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

/**
 * How many works `corpus-select` is offered to choose twelve from.
 *
 * The list goes into a prompt, so it is bounded: a compilation credited to one
 * editor runs to hundreds of entries, and an unbounded candidate list makes the
 * prompt's size a property of whichever author was typed.
 */
export const CANDIDATE_LIMIT = 200;

/**
 * The works the catalogue credits to an author.
 *
 * This is the candidate list `corpus-select` chooses from. It used to come
 * from a search against `gutendex.com`, which answers a bot challenge to a
 * datacenter address (decision 0023) — so it comes from here, where
 * `bun run catalogue:import` put it.
 *
 * **The cut is a sample, not a truncation.** Taking the first two hundred
 * titles alphabetically would hand a prolific author's selection everything up
 * to "M" and nothing after it, and `corpus-select`'s whole instruction is to
 * sample across a career. `md5(id)` orders the same author's works the same way
 * every time — so a re-run is comparable to the run before it — while the
 * ordering itself has nothing to do with the title, the date, or the order the
 * import happened to write them in. The page that survives is then presented by
 * title, which is the order a reader would expect to see it in.
 *
 * A row with an empty title is not a candidate. The catalogue's `title` is
 * `NOT NULL` and nothing in it forbids an empty string, and a work whose title
 * is blank is one `corpus-select` cannot reason about and one whose detail line
 * would name nothing.
 */
export const catalogueWorksFor = async (
  db: Db,
  authorId: string,
  limit: number = CANDIDATE_LIMIT,
): Promise<CorpusCandidate[]> => {
  const result = await db.query<{
    id: string;
    title: string;
    source_url: string;
  }>(
    `SELECT id, title, source_url FROM (
       SELECT id, title, source_url
         FROM catalogue_works
        WHERE author_id = $1 AND title <> ''
        ORDER BY md5(id)
        LIMIT $2
     ) AS sampled
     ORDER BY title`,
    [authorId, limit],
  );
  return result.rows.map((row) => ({
    id: row["id"],
    sourceUrl: row["source_url"],
    title: row["title"],
    // The catalogue credits people to a book without saying which is the
    // translator, so this is unknown here rather than guessed. `work-fetch`
    // stores what it is given.
    translator: null,
  }));
};
