import { AuteurError } from "@auteur/errors/auteur-error";
import type { UuidId } from "./branded-ids.ts";

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const isUuidId = (value: unknown): value is UuidId =>
  typeof value === "string" && UUID_V7.test(value);

/**
 * Parses an id from outside — a path parameter, a database row, a model's
 * output — or throws.
 *
 * The version and variant nibbles are checked, not just the shape: a v4 uuid
 * has the right length and the wrong ordering guarantee, and accepting one
 * would put a row in the wrong place in every paginated read for the rest of
 * its life. Invariant 4 says parse rather than cast, and this is that at the
 * narrowest boundary in the system.
 */
export const parseId = <Id extends UuidId>(
  value: unknown,
  what: string,
): Id => {
  if (!isUuidId(value)) {
    throw new AuteurError("invalid_input", `${what} is not a UUIDv7.`, {
      detail: { received: value },
    });
  }
  return value as Id;
};
