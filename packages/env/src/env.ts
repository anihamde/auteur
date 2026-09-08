import { AuteurError } from "@auteur/errors/auteur-error";
import { ENV_SPEC, type EnvKey } from "./env-spec.ts";

export type Env = { readonly [Key in EnvKey]: string };

let cached: Env | undefined;

/**
 * Parse-and-fail-fast environment access.
 *
 * Deferred, then memoized. Deferred because a module-level parse runs at import
 * time — which means a unit test of a pure function fails for want of a
 * database URL it never touches, and the fix people reach for is to stop
 * parsing at all. Memoized because the parse is the same every time and the
 * error, when there is one, should be reported once.
 *
 * It reports **every** missing or malformed variable, not the first. Fixing
 * five variables should take one run, not five.
 */
export const env = (
  source: Record<string, string | undefined> = Bun.env,
): Env => {
  if (cached !== undefined) {
    return cached;
  }

  const values: Record<string, string> = {};
  const problems: string[] = [];

  for (const [key, spec] of Object.entries(ENV_SPEC)) {
    const raw = source[key];
    if (raw === undefined || raw === "") {
      problems.push(`${key} is unset — ${spec.describe}`);
      continue;
    }
    const parsed = spec.schema.safeParse(raw);
    if (!parsed.success) {
      // The value is never echoed: these are secrets, and a diagnostic that
      // prints one puts it in a log and a terminal history.
      problems.push(`${key} is set but invalid — ${spec.describe}`);
      continue;
    }
    values[key] = raw;
  }

  if (problems.length > 0) {
    throw new AuteurError(
      "internal",
      `The environment is incomplete:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
  }

  cached = values as Env;
  return cached;
};

/** Test seam. Nothing in `apps/` calls this. */
export const resetEnvForTest = (): void => {
  cached = undefined;
};
