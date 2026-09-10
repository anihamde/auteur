/**
 * Minting an author id.
 *
 * **The catalogue has no author id.** It reports a name string per book and
 * nothing stable behind it, so the id is minted here — and the id is the
 * identity of the whole style-card cache, which makes this the most
 * consequential twenty lines in the package.
 */

/** A person the catalogue credits: an author, a translator, an editor. */
export type CataloguePerson = {
  readonly name: string;
  /** Null when nobody recorded the date, which is common and not an error. */
  readonly birthYear: number | null;
};

export const PROVIDER = "gutenberg";

/**
 * Slugify a reported name.
 *
 * The catalogue reports `"Chekhov, Anton Pavlovich"`, surname first. The comma is
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
export const mintAuthorId = (person: CataloguePerson): string => {
  const slug = slugifyName(person.name);
  return person.birthYear === null
    ? `${PROVIDER}:${slug}`
    : `${PROVIDER}:${slug}-${person.birthYear.toString()}`;
};
