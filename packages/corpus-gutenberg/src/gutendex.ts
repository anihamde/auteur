import { AuteurError } from "@auteur/errors/auteur-error";
import type { GutendexBook, GutendexSearch } from "./schema.ts";
import { parseSearch } from "./schema.ts";

/**
 * The gutendex client.
 *
 * Search only — a text download is `fetch.ts`, because the two have different
 * failure budgets and different retry rules, and folding them into one module
 * makes the search path carry the download path's timeouts.
 */

export const GUTENDEX_BASE = "https://gutendex.com";

/** Injected so every test runs offline. */
export type FetchLike = (
  url: string,
  init?: { readonly signal?: AbortSignal },
) => Promise<Response>;

export type GutendexConfig = {
  readonly fetch?: FetchLike;
  readonly baseUrl?: string;
};

const searchUrl = (base: string, query: string, page?: string): string =>
  page ?? `${base}/books?search=${encodeURIComponent(query)}&languages=en`;

/**
 * One page of results.
 *
 * A non-2xx is `corpus_unavailable` rather than `not_found`, even for a 404:
 * the url is this module's own construction, so a 404 means the service moved
 * or is down, not that the author does not exist. An author with no works is a
 * 200 with an empty `results`.
 */
export const searchPage = async (
  query: string,
  config: GutendexConfig = {},
  page?: string,
): Promise<GutendexSearch> => {
  const call = config.fetch ?? fetch;
  const url = searchUrl(config.baseUrl ?? GUTENDEX_BASE, query, page);

  let response: Response;
  try {
    response = await call(url);
  } catch (cause) {
    throw new AuteurError(
      "corpus_unavailable",
      "The corpus index could not be reached.",
      { cause, detail: { url } },
    );
  }
  if (!response.ok) {
    throw new AuteurError(
      "corpus_unavailable",
      "The corpus index could not be reached.",
      { detail: { status: response.status, url } },
    );
  }

  // Parsed, never cast. A field that moved upstream is a loud failure naming
  // the field rather than `undefined` on every row (invariant 4).
  return parseSearch(await response.json());
};

/**
 * Up to `maxPages` pages, in order.
 *
 * Paging matters because author folding counts works per author: a fold that
 * read only the first page would report a work count that *shrinks* as an
 * author gets more popular and their more-downloaded books push the rest onto
 * page two.
 *
 * It is bounded rather than exhaustive. A search for a common surname has
 * hundreds of pages, and the fold needs enough to count an author's works, not
 * every book the string matches.
 */
export const searchBooks = async (
  query: string,
  config: GutendexConfig = {},
  maxPages = 4,
): Promise<GutendexBook[]> => {
  const books: GutendexBook[] = [];
  let next: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await searchPage(query, config, next);
    books.push(...result.results);
    if (result.next === null) break;
    next = result.next;
  }
  return books;
};
