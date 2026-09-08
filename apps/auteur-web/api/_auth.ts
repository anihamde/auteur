import { ROUTE_NAMES, specOf } from "@auteur/api-contract/routes";

/**
 * Which routes the bearer token guards, derived from the contract.
 *
 * Enumerated rather than spot-checked: WP-R11's proof is that a request with
 * no token gets 401 on **every** public route, and a list written by hand is a
 * list that a sixteenth route joins without anyone noticing.
 *
 * `/internal/stage` is excluded because it carries the stage secret instead —
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
