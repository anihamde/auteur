import { AuteurError } from "@auteur/errors/auteur-error";
import type { z } from "zod";
import {
  type Method,
  ROUTE_NAMES,
  type RouteName,
  type Routes,
  specOf,
} from "./routes.ts";

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
type Spec<Name extends RouteName> = Routes[Name];

/**
 * What a route's body, query and response are, per route name.
 *
 * These live here rather than in either client because both halves of the wire
 * need them: `api-client` types its `call` options from `BodyOf`, and a Hono
 * handler types the value `parseBody` hands it from the same alias. Two
 * definitions of "what this route's body is" would be two things that agree
 * until one of them is edited.
 *
 * `z.input` for the request halves and `z.output` for the response: a request
 * is described before coercion (a cursor may arrive as a string) and a response
 * after it.
 */
export type BodyOf<Name extends RouteName> =
  Spec<Name> extends { body: infer Schema }
    ? Schema extends z.ZodType
      ? z.output<Schema>
      : never
    : undefined;

export type QueryOf<Name extends RouteName> =
  Spec<Name> extends { query: infer Schema }
    ? Schema extends z.ZodType
      ? z.output<Schema>
      : never
    : undefined;

export type BodyInputOf<Name extends RouteName> =
  Spec<Name> extends { body: infer Schema }
    ? Schema extends z.ZodType
      ? z.input<Schema>
      : never
    : undefined;

export type QueryInputOf<Name extends RouteName> =
  Spec<Name> extends { query: infer Schema }
    ? Schema extends z.ZodType
      ? z.input<Schema>
      : never
    : undefined;

export type ResponseOf<Name extends RouteName> = z.output<
  Spec<Name>["response"]
>;

export const parseBody = <Name extends RouteName>(
  name: Name,
  payload: unknown,
): BodyOf<Name> => {
  const schema = specOf(name).body;
  if (schema === undefined) return undefined as BodyOf<Name>;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AuteurError("invalid_input", "The request body is not valid.", {
      detail: { issues: parsed.error.issues, route: name },
    });
  }
  // The parse above is what proves this: `specOf(name).body` *is* the schema
  // `BodyOf<Name>` is derived from, and it just succeeded. The compiler cannot
  // follow that through the generic index into a union of sixteen shapes, which
  // is the one thing this cast stands in for.
  return parsed.data as BodyOf<Name>;
};

export const parseQuery = <Name extends RouteName>(
  name: Name,
  payload: unknown,
): QueryOf<Name> => {
  const schema = specOf(name).query;
  if (schema === undefined) return undefined as QueryOf<Name>;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AuteurError("invalid_input", "The request query is not valid.", {
      detail: { issues: parsed.error.issues, route: name },
    });
  }
  // As above: the schema that just parsed is the one the type is derived from.
  return parsed.data as QueryOf<Name>;
};

/**
 * Every route a browser may call.
 *
 * `/api/internal/stage` is excluded, and the exclusion is a function rather than a
 * comment so the router can be built from it: a route that must never be
 * reachable from a browser should not be reachable by forgetting to exclude
 * it.
 */
export const publicRoutes = (): RouteName[] =>
  ROUTE_NAMES.filter((name) => specOf(name).internal !== true);

/** The one route that reads the direct connection string. */
export const streamingRoutes = (): RouteName[] =>
  ROUTE_NAMES.filter((name) => specOf(name).stream === true);
