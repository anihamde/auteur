import { describe, expect, test } from "bun:test";
import fixture from "../tests/fixtures/gutendex-search.synthetic.json" with {
  type: "json",
};
import { foldAuthors, mintAuthorId, slugifyName } from "./authors.ts";
import { type GutendexBook, gutendexSearchSchema } from "./schema.ts";

const books = gutendexSearchSchema.parse(fixture).results;

const person = (name: string, birth: number | null = null) => ({
  birth_year: birth,
  death_year: null,
  name,
});

const book = (
  id: number,
  authors: ReturnType<typeof person>[],
): GutendexBook => ({
  authors,
  bookshelves: [],
  copyright: false,
  download_count: 1,
  formats: { "text/plain": `https://x/${id.toString()}.txt` },
  id,
  languages: ["en"],
  media_type: "Text",
  subjects: [],
  summaries: [],
  title: `Book ${id.toString()}`,
  translators: [],
});

describe("the id is minted here, because gutendex has none", () => {
  test("two authors sharing a name and differing in birth year mint distinct ids", () => {
    // What the birth year is for, and why the UI shows dates on every row.
    expect(mintAuthorId(person("Smith, John", 1820))).not.toBe(
      mintAuthorId(person("Smith, John", 1901)),
    );
  });

  test("an author with no birth year mints a stable id without one", () => {
    expect(mintAuthorId(person("Anonymous"))).toBe("gutenberg:anonymous");
    expect(mintAuthorId(person("Anonymous"))).toBe(
      mintAuthorId(person("Anonymous")),
    );
  });

  test("a changed upstream name mints a second id rather than rewriting the first", () => {
    // A card is a claim about a body of text. Quietly repointing it at a
    // different author's works would make that claim false with nothing to
    // notice.
    expect(mintAuthorId(person("Chekhov, Anton Pavlovich", 1860))).not.toBe(
      mintAuthorId(person("Chekhov, Anton", 1860)),
    );
  });

  test("diacritics fold, so the id does not depend on an encoding", () => {
    expect(slugifyName("Émile Zola")).toBe("emile-zola");
  });

  test("the comma is dropped, not reordered", () => {
    // Reordering guesses which part is the surname, and guesses wrong for a
    // mononym, for a name with a particle, and for every naming culture that
    // does not put the family name last.
    expect(slugifyName("Chekhov, Anton Pavlovich")).toBe(
      "chekhov-anton-pavlovich",
    );
  });
});

describe("folding books into authors", () => {
  test("the fixture folds to one author with three works", () => {
    const folded = foldAuthors(books);
    expect(folded).toHaveLength(1);
    expect(folded[0]?.books).toHaveLength(3);
    expect(folded[0]?.id).toBe("gutenberg:chekhov-anton-pavlovich-1860");
  });

  test("translators are collected across the works, alphabetically", () => {
    // The detail line names them because it is a fact about which text was
    // read, the same as the work title.
    expect(foldAuthors(books)[0]?.translators).toEqual(["Garnett, Constance"]);
  });

  test("a collaboration counts for both authors, which is not double-counting", () => {
    // "How many works is this author credited on" is the question the count
    // answers, and a collaboration is a work by both.
    const folded = foldAuthors([
      book(1, [person("A, A", 1800), person("B, B", 1810)]),
    ]);
    expect(folded.map((author) => author.books.length)).toEqual([1, 1]);
  });

  test("order is work count descending, then first appearance", () => {
    // First-appearance is what keeps the list stable between keystrokes; the
    // count is what puts the author the searcher meant near the top without a
    // relevance score this module has no information to compute.
    const one = person("One, O", 1800);
    const two = person("Two, T", 1810);
    const folded = foldAuthors([
      book(1, [one]),
      book(2, [two]),
      book(3, [two]),
    ]);
    expect(folded.map((author) => author.displayName)).toEqual([
      "Two, T",
      "One, O",
    ]);
  });

  test("an empty search folds to no authors rather than throwing", () => {
    expect(foldAuthors([])).toEqual([]);
  });
});
