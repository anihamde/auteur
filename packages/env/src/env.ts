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
  source: Record<string, string | undefined> = process.env,
): Env => {
  if (cached !== undefined) {
    return cached;
  }
  cached = envFor(Object.keys(ENV_SPEC) as EnvKey[], source) as Env;
  return cached;
};

/**
 * The same parse, over the variables one process actually uses.
 *
 * There are two processes now and they need different things. The worker reads
 * a queue and calls a gateway; it serves no route, so `AUTEUR_API_TOKEN`,
 * `AUTEUR_STAGE_SECRET` and `CRON_SECRET` are not merely unnecessary to it but
 * meaningless — it authenticates nobody, because nothing calls it.
 *
 * It refused to start without them, which is the failure this exists to
 * prevent: an environment check that demands a secret a process cannot use
 * teaches whoever is deploying to set secrets by superstition, and the first
 * one they get wrong is a real one.
 *
 * **Not memoized**, unlike `env()`. Two callers wanting different subsets in
 * one process would otherwise get whichever asked first.
 */
export const envFor = <Key extends EnvKey>(
  keys: readonly Key[],
  source: Record<string, string | undefined> = process.env,
): { readonly [K in Key]: string } => {
  const values: Record<string, string> = {};
  const problems: string[] = [];

  for (const key of keys) {
    const spec = ENV_SPEC[key];
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

  return values as { readonly [K in Key]: string };
};

/** Test seam. Nothing in `apps/` calls this. */
export const resetEnvForTest = (): void => {
  cached = undefined;
};
