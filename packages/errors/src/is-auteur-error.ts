import { AuteurError } from "./auteur-error.ts";
import { isErrorCode } from "./error-code.ts";

/**
 * Whether `value` is an `AuteurError`.
 *
 * Deliberately not `instanceof` alone. Bun's test runner, the bundler and the
 * dev server can each load a package through a different module instance, and
 * two `AuteurError` classes that are structurally identical fail `instanceof`
 * across that boundary — so the check is the shape, with `instanceof` as the
 * fast path.
 */
export const isAuteurError = (value: unknown): value is AuteurError => {
  if (value instanceof AuteurError) {
    return true;
  }
  if (!(value instanceof Error)) {
    return false;
  }
  const candidate = value as Error & { code?: unknown };
  return value.name === "AuteurError" && isErrorCode(candidate.code);
};
