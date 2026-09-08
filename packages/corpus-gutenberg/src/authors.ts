import type { GutendexBook, GutendexPerson } from "./schema.ts";

/**
 * Folding books into authors, and minting an author id.
 *
 * **gutendex has no author id.** It reports a name string per book and nothing
 * stable behind it, so the id is minted here — and the id is the identity of
 * the whole style-card cache, which makes this the most consequential twenty
 * lines in the package.
 */

export const PROVIDER = "gutenberg";

/**
 * Slugify a reported name.
 *
 * gutendex reports `"Chekhov, Anton Pavlovich"`, surname first. The comma is
 * dropped rather than reordered: reordering guesses which part is the surname,
 * and it guesses wrong for a mononym, for a name with a particle, and for
 * every author whose culture does not put the family name last. Dropping it
 * keeps the id a function of the string.
 */
export const slugifyName = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * `gutenberg:<slug>-<birthYear>`, and `gutenberg:<slug>` with no birth year.
 *
 * Stable as long as the name string is. **A name that changes upstream mints a
 * second author row rather than silently rewriting the card cache** — which is
 * the right failure: a card is a claim about a body of text, and quietly
 * repointing it at a different author's works would make that claim false with
 * nothing to notice.
 *
 * The birth year is what disambiguates two authors sharing a name, which is
 * also why the UI shows dates on every row.
 */
export const mintAuthorId = (person: GutendexPerson): string => {
  const slug = slugifyName(person.name);
  return person.birth_year === null
    ? `${PROVIDER}:${slug}`
    : `${PROVIDER}:${slug}-${person.birth_year.toString()}`;
};

export type FoldedAuthor = {
  readonly id: string;
  readonly displayName: string;
  readonly birthYear: number | null;
  readonly deathYear: number | null;
  /** Every book this author is credited on, in the order the search returned. */
  readonly books: readonly GutendexBook[];
  /** Distinct translators across those books, alphabetical. */
  readonly translators: readonly string[];
};

/**
 * Fold a search result into authors.
 *
 * A book with several authors contributes to each of them. That is deliberate
 * and it is not double-counting: "how many works is this author credited on" is
 * the question the work count answers, and a collaboration is a work by both.
 *
 * Order is first-appearance, then by work count descending. The first is what
 * makes the list stable between keystrokes; the second is what puts the author
 * the searcher meant near the top without a relevance score this module has no
 * information to compute.
 */
export const foldAuthors = (books: readonly GutendexBook[]): FoldedAuthor[] => {
  const byId = new Map<
    string,
    {
      person: GutendexPerson;
      books: GutendexBook[];
      translators: Set<string>;
      first: number;
    }
  >();

  books.forEach((book, index) => {
    for (const person of book.authors) {
      const id = mintAuthorId(person);
      const existing = byId.get(id);
      const entry = existing ?? {
        books: [],
        first: index,
        person,
        translators: new Set<string>(),
      };
      entry.books.push(book);
      for (const translator of book.translators) {
        entry.translators.add(translator.name);
      }
      if (existing === undefined) byId.set(id, entry);
    }
  });

  return [...byId.entries()]
    .sort(([, left], [, right]) =>
      left.books.length === right.books.length
        ? left.first - right.first
        : right.books.length - left.books.length,
    )
    .map(([id, entry]) => ({
      birthYear: entry.person.birth_year,
      books: entry.books,
      deathYear: entry.person.death_year,
      displayName: entry.person.name,
      id,
      translators: [...entry.translators].sort((left, right) =>
        left.localeCompare(right),
      ),
    }));
};
