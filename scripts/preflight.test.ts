import { describe, expect, test } from "bun:test";
import { ENV_SPEC } from "../packages/env/src/env-spec.ts";
import { problemsIn, report } from "./preflight.ts";

const COMPLETE: Record<string, string> = {
  AUTEUR_API_TOKEN: "a-token-of-at-least-16-chars",
  AUTEUR_CRON_SECRET: "a-cron-secret-of-16-plus",
  AUTEUR_STAGE_SECRET: "a-stage-secret-of-16-plus",
  DATABASE_URL: "postgres://user@host/db",
  DATABASE_URL_DIRECT: "postgres://user@host-direct/db",
  RAMP_ROUTER_API_KEY: "rk-live-something",
};

describe("preflight names what is missing", () => {
  test("a complete environment is clean", () => {
    expect(problemsIn(COMPLETE)).toEqual([]);
    expect(report([])).toContain("preflight ok");
  });

  test("the fixture covers every declared variable", () => {
    // Guards the guard: a variable added to `ENV_SPEC` and not to the fixture
    // would make the case above fail rather than pass vacuously — this says so
    // by name instead.
    expect(Object.keys(COMPLETE).sort()).toEqual(Object.keys(ENV_SPEC).sort());
  });

  test("a missing variable is named", () => {
    const { DATABASE_URL: _omitted, ...incomplete } = COMPLETE;
    const problems = problemsIn(incomplete);
    expect(problems.map((problem) => problem.key)).toEqual(["DATABASE_URL"]);
    expect(problems[0]?.why).toContain("unset");
  });

  test("an empty string counts as missing", () => {
    // A variable set to "" in a `.env` is the commonest way one goes missing.
    expect(
      problemsIn({ ...COMPLETE, RAMP_ROUTER_API_KEY: "" }).map((p) => p.key),
    ).toEqual(["RAMP_ROUTER_API_KEY"]);
  });

  test("every problem is reported, not the first", () => {
    // Fixing five variables should take one run.
    expect(problemsIn({}).length).toBe(Object.keys(ENV_SPEC).length);
  });

  test("a malformed value is named without being echoed", () => {
    // These are secrets. A diagnostic that prints one puts it in a log.
    const problems = problemsIn({ ...COMPLETE, AUTEUR_API_TOKEN: "short" });
    expect(problems.map((problem) => problem.key)).toEqual([
      "AUTEUR_API_TOKEN",
    ]);
    expect(report(problems)).not.toContain("short");
    expect(report(problems)).toContain("set but invalid");
  });
});
