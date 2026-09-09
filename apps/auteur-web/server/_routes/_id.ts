import { AuteurError } from "@auteur/errors/auteur-error";
import { z } from "zod";

/**
 * The session id in a path, parsed rather than read.
 *
 * A malformed id is `invalid_input` and not `not_found`: the two are different
 * facts, and a 404 would claim the lookup happened.
 */
export const idOf = (raw: string): string => {
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) {
    throw new AuteurError("invalid_input", "That is not a session id.");
  }
  return parsed.data;
};
