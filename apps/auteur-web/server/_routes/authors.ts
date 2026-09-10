import { parseQuery } from "@auteur/api-contract/contract";
import { ROUTES } from "@auteur/api-contract/routes";
import { detailLine } from "@auteur/corpus-gutenberg/author-row";
import { type AuthorMatch, searchAuthors } from "@auteur/corpus-store/authors";
import type { Db } from "@auteur/db/db";
import { Hono } from "hono";

/**
 * `GET /api/authors?q=` — search the catalogue this system holds.
 *
 * It used to ask `gutendex.com` on every keystroke. That host answers 403 with
 * Cloudflare's bot challenge to a datacenter address, so the deployment could
 * never search at all (decision 0023) — and even reachable, a third party in
 * the path of typing is a rate limit, a timeout and an outage this product
 * does not need to own.
 *
 * The catalogue is imported once by `bun run catalogue:import` and read from
 * here after. `unavailable` stays in the response and stays empty: the screen
 * renders it, the contract declares it, and a second provider tier (PRD §8) is
 * still the shape this grows into. An empty list is the honest answer to
 * "which providers failed" when nothing was asked.
 *
 * The detail line is still the provider package's. It names which part is
 * missing — "not yet measured" rather than a blank — and that is a fact about
 * the data wherever the data came from.
 */

export type AuthorRoutesDeps = {
  readonly db: Db;
};

const toRow = (author: AuthorMatch) => {
  const result = {
    birthYear: author.birthYear,
    ...(author.card === null ? {} : { card: author.card }),
    deathYear: author.deathYear,
    displayName: author.displayName,
    id: author.id,
    kind: author.kind,
    ...(author.measuredWords === null
      ? {}
      : { measuredWords: author.measuredWords }),
    workCount: author.workCount,
  };
  return { ...result, detail: detailLine(result) };
};

export const authorRoutes = (deps: AuthorRoutesDeps): Hono => {
  const routes = new Hono();

  routes.get(ROUTES.authors.path, async (context) => {
    const { q } = parseQuery("authors", { q: context.req.query("q") });
    const results = await searchAuthors(deps.db, q);
    return context.json({ results: results.map(toRow), unavailable: [] });
  });

  return routes;
};
