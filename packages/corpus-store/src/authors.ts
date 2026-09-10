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

/**
 * What a search row carries: the author, and the latest card if there is one.
 *
 * The card comes back in the same query rather than as a lookup per row.
 * Twenty rows on a search screen is twenty round trips to Neon, which is the
 * difference between a list that appears and a list that arrives.
 */
export type AuthorMatch = StoredAuthor & {
  readonly card: {
    readonly confidence: number;
    readonly version: number;
  } | null;
};

type MatchRow = Row & {
  card_confidence: string | null;
  card_version: number | null;
};

/** How many authors a search answers with. §5.3: the list is short on purpose. */
export const SEARCH_LIMIT = 20;

/**
 * Authors whose name contains the query.
 *
 * `ILIKE '%q%'` rather than a prefix match, because a reader types "chekhov"
 * and the catalogue stores "Chekhov, Anton Pavlovich" — a prefix search finds
 * a surname and nothing else. The trigram index added with `catalogue_works`
 * is what makes an unanchored match a query rather than a scan of 32,000 rows.
 *
 * Ordered by work count: an author with two hundred books is more likely the
 * one meant than a namesake with one, and the count is already the number the
 * detail line shows.
 */
/**
 * A reader's query as a literal, not a pattern.
 *
 * `%` and `_` are wildcards to `ILIKE`, so a search for `%` becomes `%%%` and
 * matches every author in the catalogue — bound, so not an injection, and
 * wrong all the same: a character a reader typed should find what contains it.
 * The backslash goes first, because escaping the escape after the others would
 * escape the escapes.
 */
export const literalPattern = (query: string): string =>
  `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

export const searchAuthors = async (
  db: Db,
  query: string,
  limit: number = SEARCH_LIMIT,
): Promise<AuthorMatch[]> => {
  const result = await db.query<MatchRow>(
    `SELECT ${columns(COLUMNS)}, card.confidence AS card_confidence,
            card.version AS card_version
       FROM authors
       LEFT JOIN LATERAL (
         SELECT confidence, version
           FROM style_cards
          WHERE style_cards.author_id = authors.id
          ORDER BY version DESC
          LIMIT 1
       ) AS card ON true
      WHERE authors.display_name ILIKE $1 ESCAPE '\\'
      ORDER BY authors.work_count DESC, authors.display_name
      LIMIT $2`,
    [literalPattern(query), limit],
  );
  return result.rows.map((row) => ({
    ...toAuthor(row),
    card:
      row["card_version"] === null || row["card_confidence"] === null
        ? null
        : {
            confidence: Number(row["card_confidence"]),
            version: row["card_version"],
          },
  }));
};
