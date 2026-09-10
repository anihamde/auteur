#!/usr/bin/env bun
/**
 * `bun run catalogue:import` — the corpus index, held here.
 *
 * `gutendex.com` answers 403 with Cloudflare's bot interstitial to every
 * request from the deployment, and no header passes a challenge meant for a
 * browser. `gutenberg.org` answers 200. So the catalogue is downloaded once,
 * parsed, and written to `authors` and `catalogue_works`, and search reads
 * those — no third party in the path of a keystroke.
 *
 * **Run it from anywhere with egress**, pointed at the deployment's database:
 *
 *     DATABASE_URL_DIRECT=... bun run catalogue:import
 *
 * It writes through the direct endpoint because it is one long transaction's
 * worth of work on a connection it holds, which is the shape a pooled endpoint
 * is worst at.
 *
 * **The column names here are the catalogue's, and this has never seen the
 * file.** That is exactly how the gutendex schema went wrong, so the header is
 * checked before a single row is read and the failure names the columns that
 * were missing rather than yielding empty strings for all of them.
 */
import { mintAuthorId } from "../packages/corpus-gutenberg/src/authors.ts";
import { createDb, type Db } from "../packages/db/src/db.ts";

export const CATALOGUE_URL =
  "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv";

/** The columns this import reads. Others are ignored; these must be there. */
export const REQUIRED_COLUMNS = [
  "Text#",
  "Type",
  "Title",
  "Language",
  "Authors",
] as const;

export type CatalogueRow = {
  readonly id: number;
  readonly title: string;
  readonly language: string;
  /** Verbatim, `Surname, Forename, 1860-1904; Other, A.` */
  readonly authors: string;
};

/**
 * One line of RFC 4180 CSV.
 *
 * Written rather than taken from a dependency: the file has quoted fields
 * containing commas and doubled quotes and nothing else, and a parser for that
 * is fifteen lines. A dependency for it would be a dependency in the path of
 * the one script that has to run before the product works.
 */
export const splitCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
};

/** Rows spanning several lines, because a quoted field may contain newlines. */
export const csvRecords = (text: string): string[] => {
  const records: string[] = [];
  let record = "";
  let quotes = 0;
  for (const line of text.split("\n")) {
    record = record === "" ? line : `${record}\n${line}`;
    quotes += [...line].filter((char) => char === '"').length;
    if (quotes % 2 === 0) {
      records.push(record.replace(/\r$/, ""));
      record = "";
      quotes = 0;
    }
  }
  if (record !== "") records.push(record);
  return records;
};

export type ParseResult =
  | { readonly ok: true; readonly rows: CatalogueRow[] }
  | { readonly ok: false; readonly problem: string };

/**
 * The catalogue, as rows this import understands.
 *
 * English text only: every measure in this system is built for English prose,
 * and a corpus in a language the prosody package cannot segment would produce
 * numbers that look like measurements.
 */
export const parseCatalogue = (csv: string): ParseResult => {
  const records = csvRecords(csv).filter((record) => record.trim() !== "");
  const header = records[0];
  if (header === undefined) {
    return { ok: false, problem: "the catalogue is empty" };
  }

  const columns = splitCsvLine(header);
  const missing = REQUIRED_COLUMNS.filter(
    (required) => !columns.includes(required),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      problem:
        `the catalogue's header does not carry ${missing.join(", ")}.\n` +
        `It carries: ${columns.join(", ")}.\n` +
        "The columns this import reads are named in REQUIRED_COLUMNS; one of " +
        "them was renamed upstream, and reading past this would import a " +
        "catalogue of empty strings.",
    };
  }

  const at = (fields: string[], column: string): string =>
    fields[columns.indexOf(column)] ?? "";

  const rows: CatalogueRow[] = [];
  for (const record of records.slice(1)) {
    const fields = splitCsvLine(record);
    if (at(fields, "Type") !== "Text") continue;
    if (at(fields, "Language") !== "en") continue;
    const id = Number.parseInt(at(fields, "Text#"), 10);
    const authors = at(fields, "Authors");
    if (!Number.isInteger(id) || authors === "") continue;
    rows.push({
      authors,
      id,
      language: "en",
      title: at(fields, "Title"),
    });
  }
  return { ok: true, rows };
};

export type CataloguePerson = {
  readonly name: string;
  readonly birthYear: number | null;
  readonly deathYear: number | null;
};

/**
 * The people credited on one book.
 *
 * The field is `Surname, Forename, 1860-1904; Other, A., 1900-` — semicolons
 * between people, and the dates trailing each name after a comma. The comma
 * inside a name is why this cannot be split on commas.
 */
export const parsePeople = (authors: string): CataloguePerson[] =>
  authors
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => {
      const dates = /,\s*(\d{1,4})?\s*-\s*(\d{1,4})?\s*$/.exec(entry);
      const name = dates === null ? entry : entry.slice(0, dates.index).trim();
      const year = (raw: string | undefined): number | null =>
        raw === undefined || raw === "" ? null : Number.parseInt(raw, 10);
      return {
        birthYear: dates === null ? null : year(dates[1]),
        deathYear: dates === null ? null : year(dates[2]),
        name,
      };
    })
    .filter((person) => person.name !== "");

const PROVIDER = "gutenberg";

/**
 * The author id, minted by the provider package rather than here.
 *
 * A session already in flight points at an id that path produced, and two
 * slug rules that agree today are two slug rules. `mintAuthorId` takes the
 * catalogue's own shape closely enough that this is an adapter, not a copy.
 */
export const authorIdFor = (person: CataloguePerson): string =>
  mintAuthorId({
    birth_year: person.birthYear,
    death_year: person.deathYear,
    name: person.name,
  });

export const sourceUrlFor = (id: number): string =>
  `https://www.gutenberg.org/ebooks/${id.toString()}.txt.utf-8`;

export type Folded = {
  readonly authors: Map<string, CataloguePerson & { works: number }>;
  readonly works: {
    readonly id: string;
    readonly authorId: string;
    readonly title: string;
    readonly sourceUrl: string;
  }[];
};

/**
 * Rows to authors and their works.
 *
 * A book credited to two people belongs to both, which is what makes
 * `work_count` a count of an author's books rather than of rows.
 */
export const fold = (rows: readonly CatalogueRow[]): Folded => {
  const authors = new Map<string, CataloguePerson & { works: number }>();
  const works: Folded["works"] = [];
  for (const row of rows) {
    for (const person of parsePeople(row.authors)) {
      const id = authorIdFor(person);
      const existing = authors.get(id);
      authors.set(id, {
        ...person,
        works: (existing?.works ?? 0) + 1,
      });
      works.push({
        authorId: id,
        id: `${PROVIDER}:${row.id.toString()}`,
        sourceUrl: sourceUrlFor(row.id),
        title: row.title,
      });
    }
  }
  return { authors, works };
};

/** How many rows go in one statement. Large enough to be fast, small enough to read. */
const BATCH = 500;

export const writeCatalogue = async (
  db: Db,
  folded: Folded,
): Promise<{ authors: number; works: number }> => {
  const authorRows = [...folded.authors.entries()];
  for (let start = 0; start < authorRows.length; start += BATCH) {
    const batch = authorRows.slice(start, start + BATCH);
    await db.query(
      `INSERT INTO authors (id, provider, kind, display_name, birth_year,
                            death_year, work_count, measured_words, fetched_at)
       SELECT * FROM unnest(
         $1::text[], $2::text[], $3::text[], $4::text[], $5::int[],
         $6::int[], $7::int[], $8::int[], $9::timestamptz[])
       ON CONFLICT (id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         birth_year   = EXCLUDED.birth_year,
         death_year   = EXCLUDED.death_year,
         work_count   = EXCLUDED.work_count`,
      [
        batch.map(([id]) => id),
        batch.map(() => PROVIDER),
        batch.map(() => "full-text"),
        batch.map(([, person]) => person.name),
        batch.map(([, person]) => person.birthYear),
        batch.map(([, person]) => person.deathYear),
        batch.map(([, person]) => person.works),
        // Never overwritten above: a measured author stays measured across an
        // import, which is the whole reason this does not truncate the table.
        batch.map(() => null),
        batch.map(() => null),
      ],
    );
  }

  for (let start = 0; start < folded.works.length; start += BATCH) {
    const batch = folded.works.slice(start, start + BATCH);
    await db.query(
      `INSERT INTO catalogue_works (id, author_id, title, language, source_url)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
       ON CONFLICT (id) DO UPDATE SET
         title      = EXCLUDED.title,
         source_url = EXCLUDED.source_url`,
      [
        batch.map((work) => work.id),
        batch.map((work) => work.authorId),
        batch.map((work) => work.title),
        batch.map(() => "en"),
        batch.map((work) => work.sourceUrl),
      ],
    );
  }

  return { authors: authorRows.length, works: folded.works.length };
};

if (import.meta.main) {
  const url = process.env["DATABASE_URL_DIRECT"];
  if (url === undefined || url === "") {
    process.stderr.write(
      "DATABASE_URL_DIRECT is unset. This writes many rows on a connection it\n" +
        "holds, which is what the direct endpoint is for.\n",
    );
    process.exit(1);
  }

  process.stdout.write(`GET ${CATALOGUE_URL}\n`);
  const response = await fetch(CATALOGUE_URL, {
    headers: {
      "user-agent": "auteur/0.1 (+https://github.com/anihamde/auteur)",
    },
  });
  if (!response.ok) {
    process.stderr.write(
      `The catalogue answered ${response.status.toString()}.\n`,
    );
    process.exit(1);
  }

  const parsed = parseCatalogue(await response.text());
  if (!parsed.ok) {
    process.stderr.write(`${parsed.problem}\n`);
    process.exit(1);
  }

  const folded = fold(parsed.rows);
  process.stdout.write(
    `${parsed.rows.length.toString()} English texts, ` +
      `${folded.authors.size.toString()} authors\n`,
  );

  const db = createDb({ endpoint: "direct", max: 2, url });
  try {
    const written = await writeCatalogue(db, folded);
    process.stdout.write(
      `imported ${written.authors.toString()} authors and ` +
        `${written.works.toString()} works\n`,
    );
  } finally {
    await db.close();
  }
}
