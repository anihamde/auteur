import { describe, expect, test } from "bun:test";
import fixture from "../tests/fixtures/gutendex-search.synthetic.json" with {
  type: "json",
};
import { gutendexBookSchema, parseSearch } from "./schema.ts";

const clone = (): Record<string, unknown> =>
  JSON.parse(JSON.stringify(fixture)) as Record<string, unknown>;

const firstBook = (payload: Record<string, unknown>): Record<string, unknown> =>
  (payload["results"] as Record<string, unknown>[])[0] as Record<
    string,
    unknown
  >;

describe("the synthetic fixture parses", () => {
  test("and yields the fields the provider reads", () => {
    const parsed = parseSearch(fixture);
    expect(parsed.results).toHaveLength(3);
    expect(parsed.results[0]?.authors[0]?.name).toBe(
      "Chekhov, Anton Pavlovich",
    );
    expect(parsed.results[0]?.translators[0]?.name).toBe("Garnett, Constance");
    expect(parsed.next).toContain("page=2");
  });
});

describe("a wrong guess fails loudly rather than yielding undefined", () => {
  test("a renamed field fails, and the message names it", () => {
    // The failure this whole schema exists for. If `title` were optional, a
    // rename would parse happily and every card would be built from a corpus
    // of untitled works.
    const payload = clone();
    const shaped = firstBook(payload);
    shaped["book_title"] = shaped["title"];
    delete shaped["title"];
    expect(() => parseSearch(payload)).toThrow(/title/);
  });

  test("an unknown key is ignored, because it is not this code's business", () => {
    // Gutendex added `editors`, `.strict()` rejected it, and every search on
    // the deployment failed on a response that was otherwise exactly right.
    // An upstream addition is not a breaking change.
    const payload = clone();
    firstBook(payload)["subtitle"] = "and other stories";
    firstBook(payload)["editors"] = [];
    payload["total_pages"] = 4;
    expect(parseSearch(payload).results[0]?.title).toBeDefined();
  });

  test("a field this code reads, gone, fails naming it", () => {
    // A rename is an absence, so this is the case that catches one — and it
    // does not need the schema to know what the new name is.
    const payload = clone();
    delete firstBook(payload)["title"];
    expect(() => parseSearch(payload)).toThrow(/title/);
  });

  test("a field this code never reads, gone, is not a failure", () => {
    // `download_count` was required and unused: an upstream tidy-up of it
    // would have taken the product down for a number nothing asks for.
    const payload = clone();
    delete firstBook(payload)["download_count"];
    expect(parseSearch(payload).results[0]?.title).toBeDefined();
  });

  test("a field of the wrong type fails", () => {
    const payload = clone();
    firstBook(payload)["id"] = "13415";
    expect(() => parseSearch(payload)).toThrow(/id/);
  });
});

describe("nullable is not optional", () => {
  test("a null birth year parses — an author whose dates nobody recorded", () => {
    const payload = clone();
    const authors = firstBook(payload)["authors"] as Record<string, unknown>[];
    (authors[0] as Record<string, unknown>)["birth_year"] = null;
    expect(parseSearch(payload).results[0]?.authors[0]?.birth_year).toBeNull();
  });

  test("a missing birth year does not, because that is a renamed field", () => {
    // Nullable-and-required is the shape that says "the value may be absent".
    // Optional would also accept the *key* being gone, which is the case this
    // schema exists to catch.
    const payload = clone();
    const authors = firstBook(payload)["authors"] as Record<string, unknown>[];
    delete (authors[0] as Record<string, unknown>)["birth_year"];
    expect(() => parseSearch(payload)).toThrow(/birth_year/);
  });
});

describe("formats is a map, not an enumeration", () => {
  test("a book offering a format this code does not need still parses", () => {
    // Enumerating the media types would fail a book for offering something
    // extra, and the set is not documented as closed.
    const payload = clone();
    const formats = firstBook(payload)["formats"] as Record<string, string>;
    formats["application/rdf+xml"] = "https://example.invalid/13415.rdf";
    expect(() => parseSearch(payload)).not.toThrow();
  });

  test("a book with no plain-text format parses; dropping it is fetch.ts's job", () => {
    // Stripping Gutenberg's HTML is a second cleaner with a second set of
    // failure modes, so such a book is dropped from selection rather than
    // rejected at the parse boundary.
    const parsed = parseSearch(fixture);
    const htmlOnly = parsed.results.find((book) => book.id === 57333);
    expect(Object.keys(htmlOnly?.formats ?? {})).toEqual(["text/html"]);
  });

  test("a book is parseable on its own, not only inside a page", () => {
    expect(
      gutendexBookSchema.safeParse(
        (fixture as { results: unknown[] }).results[0],
      ).success,
    ).toBe(true);
  });
});
