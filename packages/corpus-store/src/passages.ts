import type { Db } from "@auteur/db/db";
import { columns } from "@auteur/db/sql";

/**
 * The passages cache.
 *
 * A passage is a window into a work's stored text, addressed by character
 * offsets, and every derived claim on a style card cites one (invariant 2). So
 * a passage's identity has to survive the card that cites it: passages cascade
 * from their work, and nothing else deletes them.
 */

export type StoredPassage = {
  readonly id: string;
  readonly workId: string;
  readonly charStart: number;
  readonly charEnd: number;
  readonly text: string;
};

type Row = {
  id: string;
  work_id: string;
  char_start: number;
  char_end: number;
  text: string;
};

const toPassage = (row: Row): StoredPassage => ({
  charEnd: row["char_end"],
  charStart: row["char_start"],
  id: row["id"],
  text: row["text"],
  workId: row["work_id"],
});

const COLUMNS = ["id", "work_id", "char_start", "char_end", "text"];

/**
 * Insert a batch of passages in one statement.
 *
 * One statement rather than a loop: segmentation produces roughly forty
 * passages per corpus, and forty round trips to Neon is a visible fraction of
 * the research stage.
 *
 * The batch is five **array** parameters unnested into rows, not a generated
 * `VALUES (...), (...)` list. Same one round trip, but the statement text is
 * fixed — so it is one entry in the plan cache instead of one per batch size,
 * and there is nothing to interpolate.
 */
export const putPassages = async (
  db: Db,
  passages: readonly StoredPassage[],
): Promise<void> => {
  if (passages.length === 0) return;
  await db.query(
    `INSERT INTO passages (${columns(COLUMNS)})
     SELECT * FROM unnest($1::uuid[], $2::text[], $3::int[], $4::int[], $5::text[])
     ON CONFLICT (id) DO NOTHING`,
    [
      passages.map((passage) => passage.id),
      passages.map((passage) => passage.workId),
      passages.map((passage) => passage.charStart),
      passages.map((passage) => passage.charEnd),
      passages.map((passage) => passage.text),
    ],
  );
};

export const listPassagesForWork = async (
  db: Db,
  workId: string,
): Promise<StoredPassage[]> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM passages WHERE work_id = $1
     ORDER BY char_start`,
    [workId],
  );
  return result.rows.map(toPassage);
};

/**
 * The passages a card's citations point at, in one query.
 *
 * Cited passages are read by id in arbitrary groups — a card cites a handful
 * across several works — so this takes ids rather than a work.
 */
export const findPassages = async (
  db: Db,
  ids: readonly string[],
): Promise<StoredPassage[]> => {
  if (ids.length === 0) return [];
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM passages WHERE id = ANY($1::uuid[])`,
    [[...ids]],
  );
  return result.rows.map(toPassage);
};
