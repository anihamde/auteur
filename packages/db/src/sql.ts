import { AuteurError } from "@auteur/errors/auteur-error";

/**
 * SQL primitives. Knows no domain.
 *
 * There is no query builder here and there will not be one. The `database`
 * guideline's reason is that an ORM hides the query that actually runs, so the
 * plan, the index usage and the round-trip count all become invisible at the
 * call site. What is welcome is a thin typed client, which is what
 * `@auteur/db` is.
 */

/**
 * `$1, $2, $3` for a list of values, so a caller never interpolates.
 *
 * The one place a placeholder list is built, because building it at each call
 * site is how one of them ends up as a template literal.
 */
export const placeholders = (count: number, from = 1): string =>
  Array.from(
    { length: count },
    (_, index) => `$${(from + index).toString()}`,
  ).join(", ");

/**
 * An identifier, quoted, for the rare statement that cannot parameterize one.
 *
 * Refuses anything that is not a plain identifier rather than escaping it.
 * Escaping invites a caller to pass user input; refusing means the only values
 * that reach here are ones written in the source.
 */
export const identifier = (name: string): string => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new AuteurError(
      "internal",
      `"${name}" is not a plain SQL identifier. Identifiers are written in the source, never taken from input.`,
    );
  }
  return `"${name}"`;
};

/** The single row a query must return, or a `not_found` error. */
export const oneRow = <Row>(rows: readonly Row[], what: string): Row => {
  const [first] = rows;
  if (first === undefined) {
    throw new AuteurError("not_found", `${what} does not exist.`);
  }
  return first;
};

/** The one row a query may return, or `undefined`. */
export const maybeRow = <Row>(rows: readonly Row[]): Row | undefined => rows[0];
