import { describe, expect, test } from "bun:test";
import { mintAuthorId } from "../packages/corpus-gutenberg/src/authors.ts";
import {
  csvRecords,
  fold,
  parseCatalogue,
  parsePeople,
  REQUIRED_COLUMNS,
  sourceUrlFor,
  splitCsvLine,
} from "./import-catalogue.ts";

/**
 * The parser has never seen the file.
 *
 * Neither had the gutendex schema, and it was wrong in a way that took the
 * product down. So the header is checked before a row is read, and these
 * fixtures are the documented shape rather than a recorded response — which is
 * stated here rather than implied, because the difference matters.
 */

const HEADER =
  "Text#,Type,Issued,Title,Language,Authors,Subjects,LoCC,Bookshelves";

const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");

describe("csv, as this file actually uses it", () => {
  test("a quoted field keeps its commas", () => {
    expect(splitCsvLine('1,Text,"Chekhov, Anton",en')).toEqual([
      "1",
      "Text",
      "Chekhov, Anton",
      "en",
    ]);
  });

  test("a doubled quote is one quote", () => {
    expect(splitCsvLine('1,"He said ""no""",en')).toEqual([
      "1",
      'He said "no"',
      "en",
    ]);
  });

  test("a record may span lines, because a quoted field may contain one", () => {
    // Titles do. Splitting on newlines alone would cut a book in half and
    // leave the second half looking like a row with three columns.
    expect(csvRecords('1,"A Title\nContinued",en\n2,"Plain",en')).toEqual([
      '1,"A Title\nContinued",en',
      '2,"Plain",en',
    ]);
  });
});

describe("the header is checked before a row is read", () => {
  test("a renamed column fails, naming it and what was there instead", () => {
    // The failure the gutendex schema had: read past this and every row is a
    // catalogue of empty strings, imported without complaint.
    const result = parseCatalogue(
      "Id,Type,Title,Language,Authors\n1,Text,A,en,B",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toContain("Text#");
    expect(result.problem).toContain("Id");
  });

  test("every column this import reads is required", () => {
    for (const column of REQUIRED_COLUMNS) {
      const header = REQUIRED_COLUMNS.filter((other) => other !== column).join(
        ",",
      );
      const result = parseCatalogue(`${header}\n`);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.problem).toContain(column);
    }
  });

  test("a column this import does not read may come and go", () => {
    const result = parseCatalogue(
      `${HEADER},SomethingNew\n1,Text,1990,A Title,en,"Chekhov, Anton, 1860-1904",,,,x`,
    );
    expect(result.ok).toBe(true);
  });
});

describe("what the catalogue is filtered to", () => {
  test("English texts only", () => {
    // Every measure here is built for English prose. A corpus in a language
    // the segmenter cannot read would produce numbers that look like
    // measurements.
    const result = parseCatalogue(
      csv(
        '1,Text,1990,English Book,en,"A, B, 1800-1850",,,',
        '2,Text,1990,Russian Book,ru,"C, D, 1800-1850",,,',
        '3,Sound,1990,An Audiobook,en,"E, F, 1800-1850",,,',
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((row) => row.title)).toEqual(["English Book"]);
  });

  test("a book credited to nobody is skipped", () => {
    // It cannot be folded under an author, and an author list is what this
    // exists to build.
    const result = parseCatalogue(csv("1,Text,1990,Anonymous,en,,,,"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([]);
  });
});

describe("a credit line names people, and the comma is inside the name", () => {
  test("dates are read and removed from the name", () => {
    expect(parsePeople("Chekhov, Anton Pavlovich, 1860-1904")).toEqual([
      { birthYear: 1860, deathYear: 1904, name: "Chekhov, Anton Pavlovich" },
    ]);
  });

  test("several people, separated by semicolons", () => {
    expect(
      parsePeople("Chekhov, Anton, 1860-1904; Garnett, Constance, 1861-1946"),
    ).toHaveLength(2);
  });

  test("a living author has a birth year and no death year", () => {
    expect(parsePeople("Someone, A., 1970-")).toEqual([
      { birthYear: 1970, deathYear: null, name: "Someone, A." },
    ]);
  });

  test("a name with no dates keeps all of itself", () => {
    // Splitting on the last comma unconditionally would take a forename off
    // every author whose dates nobody recorded.
    expect(parsePeople("Homer")).toEqual([
      { birthYear: null, deathYear: null, name: "Homer" },
    ]);
  });
});

describe("folding", () => {
  test("a book credited to two people belongs to both", () => {
    const folded = fold([
      {
        authors: "Chekhov, Anton, 1860-1904; Garnett, Constance, 1861-1946",
        id: 13415,
        language: "en",
        title: "The Party and Other Stories",
      },
    ]);
    expect(folded.authors.size).toBe(2);
    expect(folded.works).toHaveLength(2);
    // The same book under both, which is what makes work_count a count of an
    // author's books rather than of rows.
    expect(new Set(folded.works.map((work) => work.id)).size).toBe(1);
  });

  test("an author's work count is their books", () => {
    const folded = fold(
      [1, 2, 3].map((id) => ({
        authors: "Chekhov, Anton, 1860-1904",
        id,
        language: "en",
        title: `Book ${id.toString()}`,
      })),
    );
    expect([...folded.authors.values()][0]?.works).toBe(3);
  });

  test("the id is the one the card cache is keyed on", () => {
    // Minted by `corpus-gutenberg` rather than here: a card is a claim about a
    // body of text, and two slug rules that agree today are two slug rules.
    expect(
      mintAuthorId({
        birthYear: 1860,
        name: "Chekhov, Anton Pavlovich",
      }),
    ).toBe("gutenberg:chekhov-anton-pavlovich-1860");
  });

  test("the source url is the text, not the landing page", () => {
    expect(sourceUrlFor(84)).toBe(
      "https://www.gutenberg.org/ebooks/84.txt.utf-8",
    );
  });
});
