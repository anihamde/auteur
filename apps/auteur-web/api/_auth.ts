import { ROUTE_NAMES, specOf } from "@auteur/api-contract/routes";

/**
 * Which routes the bearer token guards, derived from the contract.
 *
 * Enumerated rather than spot-checked: WP-R11's proof is that a request with
 * no token gets 401 on **every** public route, and a list written by hand is a
 * list that a sixteenth route joins without anyone noticing.
 *
 * `/api/internal/stage` is excluded because it carries the stage secret instead —
 * a different secret on purpose, so a browser holding the client's token cannot
 * drive the pipeline directly.
 */
export const GUARDED_PATHS: readonly string[] = ROUTE_NAMES.filter(
  (name) => specOf(name).internal !== true && name !== "health",
).map((name) => specOf(name).path);

/** The one route a probe reaches without a token. See `_app.ts`. */
export const UNGUARDED_PATHS: readonly string[] = [specOf("health").path];

/** Routes signed with the stage secret rather than the bearer token. */
export const SIGNED_PATHS: readonly string[] = ROUTE_NAMES.filter(
  (name) => specOf(name).internal === true,
).map((name) => specOf(name).path);

/**
 * Whether a path is one of the internal routes.
 *
 * Derived from the contract rather than tested against a `/api/internal/`
 * prefix: the prefix is a convention, and a convention checked by hand is one
 * a route can quietly fall outside of. Two callers need this — the bearer
 * middleware, which must let these through to their own secrets, and the
 * traffic sweep, which must not run on them.
 */
export const isInternalPath = (path: string): boolean =>
  SIGNED_PATHS.includes(path);
