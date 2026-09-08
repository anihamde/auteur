import { describe, expect, test } from "bun:test";
import fixture from "../tests/fixtures/gutendex-search.synthetic.json" with {
  type: "json",
};
import { searchBooks, searchPage } from "./gutendex.ts";

const page = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });

describe("the search url", () => {
  test("carries the query and restricts to English", async () => {
    // The segmenter's abbreviation list, the suffix classifier and the
    // dialogue-marker detector are all English-shaped, so measuring a Spanish
    // original with them produces numbers that look fine and mean nothing.
    const urls: string[] = [];
    await searchPage("chekhov", {
      fetch: (url) => {
        urls.push(url);
        return Promise.resolve(page(fixture));
      },
    });
    expect(urls[0]).toContain("search=chekhov");
    expect(urls[0]).toContain("languages=en");
  });

  test("the query is encoded, so a space or an accent does not break the url", () => {
    const urls: string[] = [];
    void searchPage("garcía márquez", {
      fetch: (url) => {
        urls.push(url);
        return Promise.resolve(page(fixture));
      },
    });
    expect(urls[0]).toContain("garc%C3%ADa%20m%C3%A1rquez");
  });
});

describe("failure is corpus_unavailable, whatever the status", () => {
  test("a 404 is the service moving, not an author who does not exist", () => {
    // The url is this module's own construction. An author with no works is a
    // 200 with an empty results list.
    expect(
      searchPage("x", { fetch: () => Promise.resolve(page({}, 404)) }),
    ).rejects.toMatchObject({ code: "corpus_unavailable" });
  });

  test("a transport failure is corpus_unavailable too", () => {
    expect(
      searchPage("x", { fetch: () => Promise.reject(new TypeError("dns")) }),
    ).rejects.toMatchObject({ code: "corpus_unavailable" });
  });

  test("a body the schema rejects throws naming the field", () => {
    // Parsed, never cast. A field that moved upstream is a loud failure rather
    // than undefined on every row.
    expect(
      searchPage("x", {
        fetch: () => Promise.resolve(page({ count: 0, results: [] })),
      }),
    ).rejects.toThrow(/next/);
  });
});

describe("paging", () => {
  test("it follows next, because a work count that stops at page one shrinks", () => {
    // The failure: an author's more-downloaded books push the rest onto page
    // two, so a fold reading only page one reports fewer works as the author
    // gets more popular.
    const first = { ...fixture, next: "https://gutendex.com/books?page=2" };
    const second = { ...fixture, next: null };
    let call = 0;
    return searchBooks("chekhov", {
      fetch: () => {
        call += 1;
        return Promise.resolve(page(call === 1 ? first : second));
      },
    }).then((books) => {
      expect(call).toBe(2);
      expect(books).toHaveLength(6);
    });
  });

  test("it is bounded, because a common surname has hundreds of pages", async () => {
    let calls = 0;
    await searchBooks(
      "smith",
      {
        fetch: () => {
          calls += 1;
          return Promise.resolve(
            page({ ...fixture, next: "https://gutendex.com/books?page=99" }),
          );
        },
      },
      3,
    );
    expect(calls).toBe(3);
  });

  test("a single page stops at one request", async () => {
    let calls = 0;
    await searchBooks("chekhov", {
      fetch: () => {
        calls += 1;
        return Promise.resolve(page({ ...fixture, next: null }));
      },
    });
    expect(calls).toBe(1);
  });
});
