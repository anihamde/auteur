import { AuteurError } from "@auteur/errors/auteur-error";
import { type Method, ROUTE_NAMES, type RouteName, specOf } from "./routes.ts";

/**
 * Reading the contract: paths, parsing, and the one place a path is built.
 *
 * The route table is data; this is what both sides do with it. A client that
 * built its own url from a template string and a server that matched its own
 * pattern would be two implementations of one fact, and the first thing they
 * would disagree about is a trailing slash.
 */

export type PathParams = Readonly<Record<string, string>>;

/**
 * Fill a route's path.
 *
 * Every segment is encoded. A session id is a uuid and needs no encoding today,
 * but the function that does not encode is the one that is still there when a
 * path parameter becomes a slug.
 */
export const pathFor = (name: RouteName, params: PathParams = {}): string =>
  specOf(name).path.replace(/:([a-zA-Z]+)/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new AuteurError(
        "internal",
        `The ${name} route needs a ${key} and none was given.`,
      );
    }
    return encodeURIComponent(value);
  });

export const methodFor = (name: RouteName): Method => specOf(name).method;

/**
 * Parse a request body against the route's schema.
 *
 * `invalid_input`, which maps to 400, and the issues go in `detail` rather than
 * in the message: the message is read by a person and the issues are read by a
 * log. A zod issue list rendered into a user-facing sentence is a sentence
 * nobody can act on.
 */
export const parseBody = <Name extends RouteName>(
  name: Name,
  payload: unknown,
): unknown => {
  const schema = specOf(name).body;
  if (schema === undefined) return undefined;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AuteurError("invalid_input", "The request body is not valid.", {
      detail: { issues: parsed.error.issues, route: name },
    });
  }
  return parsed.data;
};

export const parseQuery = <Name extends RouteName>(
  name: Name,
  payload: unknown,
): unknown => {
  const schema = specOf(name).query;
  if (schema === undefined) return undefined;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AuteurError("invalid_input", "The request query is not valid.", {
      detail: { issues: parsed.error.issues, route: name },
    });
  }
  return parsed.data;
};

/**
 * Every route a browser may call.
 *
 * `/internal/stage` is excluded, and the exclusion is a function rather than a
 * comment so the router can be built from it: a route that must never be
 * reachable from a browser should not be reachable by forgetting to exclude
 * it.
 */
export const publicRoutes = (): RouteName[] =>
  ROUTE_NAMES.filter((name) => specOf(name).internal !== true);

/** The one route that reads the direct connection string. */
export const streamingRoutes = (): RouteName[] =>
  ROUTE_NAMES.filter((name) => specOf(name).stream === true);
