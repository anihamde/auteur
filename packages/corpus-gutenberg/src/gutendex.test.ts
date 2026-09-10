import { describe, expect, test } from "bun:test";
import fixture from "../tests/fixtures/gutendex-search.synthetic.json" with {
  type: "json",
};
import {
  refusalDetail,
  searchBooks,
  searchPage,
  searchUrl,
} from "./gutendex.ts";

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

describe("the client says who it is", () => {
  test("a search carries a User-Agent", async () => {
    // Node's fetch sends none, and gutendex answers 403 to a request without
    // one: on the deployment every author search failed while the same url
    // from a laptop returned thirty books.
    let seen: Readonly<Record<string, string>> | undefined;
    await searchPage("chekhov", {
      baseUrl: "https://corpus.auteur.test",
      fetch: async (_url, init) => {
        seen = init?.headers;
        return Response.json({ next: null, results: [] });
      },
    });

    expect(seen?.["user-agent"]).toContain("auteur/");
    // A contact address, because a free public service being asked
    // automatically should be able to find a person.
    expect(seen?.["user-agent"]).toContain("https://");
  });

  test("it asks for json", async () => {
    let seen: Readonly<Record<string, string>> | undefined;
    await searchPage("chekhov", {
      baseUrl: "https://corpus.auteur.test",
      fetch: async (_url, init) => {
        seen = init?.headers;
        return Response.json({ next: null, results: [] });
      },
    });
    expect(seen?.["accept"]).toBe("application/json");
  });
});

describe("a refusal says what refused", () => {
  test("an edge block is distinguishable from the service's own answer", async () => {
    // A status alone cannot tell a client rejection from a network one, and the
    // two have different fixes: an edge rule refusing where the request came
    // from is not something a header changes.
    const detail = await refusalDetail(
      new Response(
        "<!DOCTYPE html><title>Attention Required! | Cloudflare</title>",
        {
          headers: { "cf-ray": "9a1b2c3d4e5f6789-IAD", server: "cloudflare" },
          status: 403,
        },
      ),
      "https://corpus.auteur.test/books",
    );

    expect(detail["status"]).toBe(403);
    expect(detail["server"]).toBe("cloudflare");
    expect(detail["cfRay"]).toBe("9a1b2c3d4e5f6789-IAD");
    expect(String(detail["body"])).toContain("Cloudflare");
  });

  test("a long body is truncated, because a block page is a page", async () => {
    const detail = await refusalDetail(
      new Response("x".repeat(5000), { status: 403 }),
      "https://corpus.auteur.test/books",
    );
    expect(String(detail["body"]).length).toBeLessThan(500);
    expect(String(detail["body"]).endsWith("…")).toBe(true);
  });

  test("headers that are not there are not reported as null", async () => {
    const detail = await refusalDetail(
      new Response('{"detail":"throttled"}', { status: 429 }),
      "https://corpus.auteur.test/books",
    );
    expect(Object.keys(detail).sort()).toEqual(["body", "status", "url"]);
  });
});

describe("the url asked for is the one the service serves", () => {
  test("the search path carries its trailing slash", () => {
    // `/books` answers 301 to `/books/`. Asking for the redirect pays a hop on
    // every keystroke, and following one is where a client can lose the
    // headers it set — a difference that shows on one network and not another.
    expect(searchUrl("https://corpus.auteur.test", "chekhov")).toBe(
      "https://corpus.auteur.test/books/?search=chekhov&languages=en",
    );
  });

  test("a page url from the service is used as given", () => {
    // It is the service's own `next`, so it is already canonical; rebuilding it
    // would be this code second-guessing a url it was handed.
    const next = "https://corpus.auteur.test/books/?page=2&search=chekhov";
    expect(searchUrl("https://corpus.auteur.test", "chekhov", next)).toBe(next);
  });

  test("the query is encoded, not concatenated", () => {
    // An unencoded `&` would end the search term and start a parameter the
    // service does not have, and the author list would be for "o" alone.
    expect(searchUrl("https://corpus.auteur.test", "o'brien & sons")).toContain(
      `search=${encodeURIComponent("o'brien & sons")}`,
    );
  });
});
