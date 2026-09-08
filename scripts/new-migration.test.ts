import { describe, expect, test } from "bun:test";
import { checkOneMigration, checkVersionSequence } from "./check-migrations.ts";
import { nextVersion, scaffold, slugify } from "./new-migration.ts";

describe("the scaffold applies nothing on its own", () => {
  test("it holds no statement — every line is a comment or blank", () => {
    // A scaffolded-and-forgotten migration must be a no-op, not a schema change
    // nobody wrote. The ledger will record it as applied either way.
    const body = scaffold(3, "add_heartbeat");
    for (const line of body.split("\n")) {
      expect(line === "" || line.startsWith("--")).toBe(true);
    }
    expect(body).not.toContain(";");
  });

  test("its own explanatory text does not trip the expand/contract gate", () => {
    // The header explains the rule using the words the rule matches on. If the
    // gate read comments, `migration:new` would produce a file that fails CI.
    expect(checkOneMigration("0003_x.sql", 3, scaffold(3, "x"))).toEqual([]);
  });

  test("the file it names lands at the next contiguous version", () => {
    const version = nextVersion(["0001_ledger.sql", "0002_schema.sql"]);
    expect(version).toBe(3);
    expect(
      checkVersionSequence([
        "0001_ledger.sql",
        "0002_schema.sql",
        `${version.toString().padStart(4, "0")}_x.sql`,
      ]),
    ).toEqual([]);
  });

  test("an empty directory starts at 1, not 0", () => {
    expect(nextVersion([])).toBe(1);
  });
});

describe("slugify", () => {
  test("a sentence becomes a filename fragment with no leading or trailing gaps", () => {
    expect(slugify("  Add stage_queue heartbeat!  ")).toBe(
      "add_stage_queue_heartbeat",
    );
  });

  test("a name with nothing usable in it is empty, which the caller refuses", () => {
    expect(slugify("!!!")).toBe("");
  });
});
