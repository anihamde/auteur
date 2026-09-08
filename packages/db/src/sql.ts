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
 * There is deliberately no `placeholders(n)` helper here.
 *
 * One was written, and gate 13 — which refuses any interpolation into a SQL
 * literal — made it unusable: every call site had to splice its result into the
 * statement text. That turned out to be the right pressure rather than a
 * problem to route around. Postgres takes arrays as parameters, so a variable
 * number of values is `= ANY($1::uuid[])` for a lookup and `SELECT * FROM
 * unnest($1::uuid[], $2::text[], ...)` for a bulk insert: one static statement,
 * one plan in the cache, and nothing built by string concatenation.
 */

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

/**
 * A comma-separated column list, every name validated as a plain identifier.
 *
 * The same argument as `identifier`, for the other thing a statement cannot
 * parameterize: `SELECT $1 FROM t` selects the string, not the column. Gate 13
 * permits this call inside a SQL literal for exactly that reason — the names
 * are checked one by one, so a list assembled from anything but source text
 * throws rather than reaching Postgres.
 *
 * Unquoted, unlike `identifier`: a column list reads far better as
 * `id, work_id, char_start` than as `"id", "work_id", "char_start"`, and the
 * validation is the same either way.
 */
export const columns = (names: readonly string[]): string => {
  for (const name of names) {
    identifier(name);
  }
  return names.join(", ");
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
