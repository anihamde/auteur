import { type FoldedAuthor, foldAuthors } from "./authors.ts";
import { type GutendexConfig, searchBooks } from "./gutendex.ts";

/**
 * The `CorpusProvider` seam.
 *
 * One implementation and a seam anyway, because `PRD.md` §8's secondary tier is
 * designed and not built: a `secondary`-kind provider registered alongside this
 * one unions into search results without the builder changing. The seam is what
 * makes that a later addition rather than a refactor.
 */

export type AuthorKind = "full-text" | "secondary";

/**
 * One row on the author screen.
 *
 * `measuredWords` and `card` are **optional, and that is the design**
 * (`ARCHITECTURE.md` §5.3). Two of the four facts the design's row shows are
 * unknowable at search time: a word count requires downloading the texts, and
 * an exemplar count requires a built card. Search-as-you-type cannot download a
 * million words per keystroke.
 *
 * So they are populated from local tables when they are there, and the detail
 * line has three forms. The design's row is the third — correct for the author
 * it shows, which in the mockup is one already built.
 */
export type AuthorResult = {
  readonly id: string;
  readonly displayName: string;
  readonly kind: AuthorKind;
  readonly birthYear: number | null;
  readonly deathYear: number | null;
  readonly workCount: number;
  readonly translators: readonly string[];
  /** Present once a corpus has been fetched and counted. */
  readonly measuredWords?: number;
  /** Present once a card has been built for this author. */
  readonly card?: { readonly version: number; readonly confidence: number };
};

export type CorpusProvider = {
  readonly id: string;
  readonly kind: AuthorKind;
  readonly search: (query: string) => Promise<AuthorResult[]>;
};

/**
 * The detail line, in the three states.
 *
 * Assembled here rather than in the screen because the state it names is a fact
 * about the data, and a component deciding which sentence to render would be a
 * component deciding what is known. Degradation names which part is missing —
 * "not yet measured" rather than a blank, and "no card yet" rather than a zero.
 */
export const detailLine = (author: AuthorResult): string => {
  const works = `${author.workCount.toString()} works`;
  if (author.measuredWords === undefined) {
    return `${works} · not yet measured`;
  }
  const measured = `${author.measuredWords.toLocaleString("en-US")} words`;
  if (author.card === undefined) {
    return `${works} · ${measured} measured · no card yet`;
  }
  return `${works} · ${measured} · card@${author.card.version.toString()}, confidence ${author.card.confidence.toFixed(2)}`;
};

const toResult = (folded: FoldedAuthor): AuthorResult => ({
  birthYear: folded.birthYear,
  deathYear: folded.deathYear,
  displayName: folded.displayName,
  id: folded.id,
  kind: "full-text",
  translators: folded.translators,
  workCount: folded.books.length,
});

/**
 * What the local tables know about one author, as a function.
 *
 * Injected rather than reached for. This package is `service`-layer and
 * `@auteur/db` is `infra`: taking a `Db` here would put a database handle in
 * the middle of a corpus provider, and the dependency gate says so. Passing the
 * lookup keeps the read at the caller, which is where the transaction and the
 * endpoint choice already live.
 */
export type AuthorFacts = (id: string) => Promise<
  | {
      readonly measuredWords: number | null;
      readonly card?: { readonly version: number; readonly confidence: number };
    }
  | undefined
>;

/**
 * Fill in what the local tables know.
 *
 * Never writes. A search must not populate the cache, or typing an author's
 * name would fetch their corpus.
 */
export const withLocalFacts = async (
  lookup: AuthorFacts,
  results: readonly AuthorResult[],
): Promise<AuthorResult[]> =>
  Promise.all(
    results.map(async (result) => {
      const stored = await lookup(result.id);
      if (stored === undefined) return result;
      return {
        ...result,
        ...(stored.card !== undefined && { card: stored.card }),
        ...(stored.measuredWords !== null && {
          measuredWords: stored.measuredWords,
        }),
      };
    }),
  );

export const createGutenbergProvider = (
  config: GutendexConfig = {},
): CorpusProvider => ({
  id: "gutenberg",
  kind: "full-text",
  search: async (query) =>
    foldAuthors(await searchBooks(query, config)).map(toResult),
});

/**
 * Union several providers' results.
 *
 * Order is provider order then each provider's own, so registering the
 * secondary tier appends rather than reorders — a list that reshuffles when a
 * provider is added is a list nobody can point at.
 */
export const searchAll = async (
  providers: readonly CorpusProvider[],
  query: string,
): Promise<AuthorResult[]> => {
  const perProvider = await Promise.all(
    providers.map(async (provider) => provider.search(query)),
  );
  return perProvider.flat();
};
