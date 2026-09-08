#!/usr/bin/env bun
/**
 * `bun run preflight` — is this environment complete?
 *
 * Every variable `@auteur/env` declares, checked before anything opens a
 * connection or makes a call. The point is the failure mode: without it the
 * first missing variable surfaces as whatever the code that needed it does when
 * it is absent — a connection refused, a 401 from the gateway — three layers
 * from the thing that is actually wrong.
 *
 * It reports **every** problem, not the first. Fixing five variables should
 * take one run.
 */
import { ENV_SPEC } from "../packages/env/src/env-spec.ts";

export type Problem = { readonly key: string; readonly why: string };

export const problemsIn = (
  source: Readonly<Record<string, string | undefined>>,
): Problem[] => {
  const problems: Problem[] = [];
  for (const [key, spec] of Object.entries(ENV_SPEC)) {
    const raw = source[key];
    if (raw === undefined || raw === "") {
      problems.push({ key, why: `unset — ${spec.describe}` });
      continue;
    }
    if (!spec.schema.safeParse(raw).success) {
      // The value is never echoed: these are secrets, and a diagnostic that
      // prints one puts it in a log and a terminal history.
      problems.push({ key, why: `set but invalid — ${spec.describe}` });
    }
  }
  return problems;
};

export const report = (problems: readonly Problem[]): string =>
  problems.length === 0
    ? `preflight ok: ${Object.keys(ENV_SPEC).length.toString()} variables present and valid`
    : [
        `The environment is incomplete — ${problems.length.toString()} problem(s):`,
        ...problems.map((problem) => `  - ${problem.key} is ${problem.why}`),
      ].join("\n");

if (import.meta.main) {
  const problems = problemsIn(Bun.env);
  process.stdout.write(`${report(problems)}\n`);
  process.exit(problems.length === 0 ? 0 : 1);
}
