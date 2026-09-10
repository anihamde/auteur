import { parseQuery } from "@auteur/api-contract/contract";
import { ROUTES } from "@auteur/api-contract/routes";
import { latestCardForAuthor } from "@auteur/card-store/cards";
import {
  type AuthorFacts,
  type AuthorResult,
  type CorpusProvider,
  createGutenbergProvider,
  detailLine,
  searchAll,
  withLocalFacts,
} from "@auteur/corpus-gutenberg/provider";
import { findAuthor } from "@auteur/corpus-store/authors";
import type { Db } from "@auteur/db/db";
import { isAuteurError } from "@auteur/errors/is-auteur-error";
import type { Logger } from "@auteur/logger/logger";
import { Hono } from "hono";

/**
 * `GET /api/authors?q=` — search, unioned across providers.
 *
 * The union is the provider package's, not this route's: a route that folded
 * two providers itself would be a second place the tier order and the
 * failure policy are decided.
 *
 * The detail line is assembled here-ish too — in the provider package — rather
 * than in the screen, because the state it names is a fact about the data
 * (§5.3). A component choosing which of the three sentences to render would be
 * a component deciding what is known.
 */

export type AuthorRoutesDeps = {
  readonly db: Db;
  /**
   * Where a provider's failure goes. Absent in a test that asserts on the
   * union rather than on what was written about it.
   */
  readonly logger?: Logger;
  /**
   * Injected so a test runs offline against a fixture and the live route runs
   * against Gutendex. Defaults to the one provider that exists; PRD §8's
   * secondary tier registers here without this file changing shape.
   */
  readonly providers?: readonly CorpusProvider[];
};

/**
 * The two tables §5.3's detail line is assembled from, as one lookup.
 *
 * `authors` knows the measured word count and `style_cards` knows the card, and
 * neither knows the other — so composing them is the caller's job, which is
 * what `AuthorFacts` being a function rather than a `Db` is for. A lookup that
 * read only `authors` would make the third detail-line state unreachable: the
 * row would always say "no card yet" no matter how many cards existed.
 */
const localFacts =
  (db: Db): AuthorFacts =>
  async (id) => {
    const [author, card] = await Promise.all([
      findAuthor(db, id),
      latestCardForAuthor(db, id),
    ]);
    if (author === undefined) return undefined;
    return {
      ...(card !== undefined && {
        card: { confidence: card.confidence, version: card.version },
      }),
      measuredWords: author.measuredWords,
    };
  };

const toRow = (author: AuthorResult) => ({
  ...(author.card !== undefined && { card: author.card }),
  birthYear: author.birthYear,
  deathYear: author.deathYear,
  detail: detailLine(author),
  displayName: author.displayName,
  id: author.id,
  kind: author.kind,
  ...(author.measuredWords !== undefined && {
    measuredWords: author.measuredWords,
  }),
  workCount: author.workCount,
});

export const authorRoutes = (deps: AuthorRoutesDeps): Hono => {
  const routes = new Hono();
  const providers = deps.providers ?? [createGutenbergProvider()];

  routes.get(ROUTES.authors.path, async (context) => {
    const { q } = parseQuery("authors", {
      q: context.req.query("q"),
    });
    const { results, unavailable } = await searchAll(
      providers,
      q,
      (providerId, reason) => {
        // The screen is told which provider is missing; the log is told why.
        // Without this, "gutenberg unavailable" is the whole of what anyone
        // ever learns — the same shape as a stage invocation that swallowed
        // its own 401.
        deps.logger?.error("corpus provider unavailable", {
          message:
            reason instanceof Error ? reason.message : "non-error thrown",
          provider: providerId,
          ...(isAuteurError(reason) && reason.detail !== undefined
            ? { detail: reason.detail }
            : {}),
        });
      },
    );
    // Reads the local tables; never writes them. Typing an author's name must
    // not fetch their corpus.
    const filled = await withLocalFacts(localFacts(deps.db), results);
    return context.json({ results: filled.map(toRow), unavailable });
  });

  return routes;
};
