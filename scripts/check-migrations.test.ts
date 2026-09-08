import { describe, expect, test } from "bun:test";
import {
  checkOneMigration,
  checkVersionSequence,
  stripSqlNoise,
} from "./check-migrations.ts";

describe("expand and contract may not share a file", () => {
  test("adding a column and dropping the one it replaces is rejected", () => {
    // The shape that breaks a rollout with two deploy units live: the
    // migration runs, the new code works, and every request still served by
    // the previous version fails on a column that is no longer there.
    const violations = checkOneMigration(
      "0007_rename_idea.sql",
      7,
      `ALTER TABLE sessions ADD COLUMN idea_text text;
       ALTER TABLE sessions DROP COLUMN idea;`,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.reason).toContain("DROP COLUMN");
    expect(violations[0]?.reason).toContain("ADD COLUMN");
  });

  test("a rename alongside a new table is rejected", () => {
    expect(
      checkOneMigration(
        "0007_x.sql",
        7,
        `CREATE TABLE overlays (id uuid PRIMARY KEY);
         ALTER TABLE sessions RENAME COLUMN idea TO idea_text;`,
      ),
    ).toHaveLength(1);
  });

  test("SET NOT NULL alongside the column that feeds it is rejected", () => {
    // Backfilling and tightening in one file means the previous version's
    // inserts, which do not write the column, start failing mid-deploy.
    expect(
      checkOneMigration(
        "0007_x.sql",
        7,
        `ALTER TABLE sessions ADD COLUMN tier text;
         ALTER TABLE sessions ALTER COLUMN tier SET NOT NULL;`,
      ),
    ).toHaveLength(1);
  });

  test("a pure expansion passes", () => {
    expect(
      checkOneMigration(
        "0007_x.sql",
        7,
        `ALTER TABLE sessions ADD COLUMN idea_text text;
         CREATE INDEX sessions_step ON sessions (step);`,
      ),
    ).toEqual([]);
  });

  test("a pure contraction passes — it is the later deploy's own migration", () => {
    expect(
      checkOneMigration(
        "0008_x.sql",
        8,
        "ALTER TABLE sessions DROP COLUMN idea;",
      ),
    ).toEqual([]);
  });

  test("0001 and 0002 are the origin, where nothing is live to break", () => {
    const both = `CREATE TABLE t (a int);
       DROP TABLE legacy;`;
    expect(checkOneMigration("0002_schema.sql", 2, both)).toEqual([]);
    expect(checkOneMigration("0003_later.sql", 3, both)).toHaveLength(1);
  });
});

describe("comments and string literals are not statements", () => {
  test("DROP COLUMN inside a comment does not trip the rule", () => {
    // Otherwise the scaffold's own explanatory header would fail the gate that
    // wrote it, and the fix a reader would reach for is to delete the comment.
    expect(
      checkOneMigration(
        "0007_x.sql",
        7,
        `-- later: ALTER TABLE sessions DROP COLUMN idea;
         ALTER TABLE sessions ADD COLUMN idea_text text;`,
      ),
    ).toEqual([]);
  });

  test("a quoted string containing SQL is not read as SQL", () => {
    expect(
      checkOneMigration(
        "0007_x.sql",
        7,
        `ALTER TABLE sessions ADD COLUMN note text DEFAULT 'drop column idea';`,
      ),
    ).toEqual([]);
  });

  test("a block comment is stripped whole", () => {
    expect(stripSqlNoise("/* drop table x */ select 1")).not.toContain("drop");
  });
});

describe("versions are contiguous from 0001", () => {
  test("a gap means an applied migration was deleted", () => {
    const violations = checkVersionSequence([
      "0001_ledger.sql",
      "0002_schema.sql",
      "0004_gap.sql",
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.file).toBe("0004_gap.sql");
  });

  test("a repeated version is rejected", () => {
    expect(
      checkVersionSequence(["0001_a.sql", "0001_b.sql"]).length,
    ).toBeGreaterThan(0);
  });

  test("an unnumbered file is rejected, because its ledger order is undefined", () => {
    expect(checkVersionSequence(["schema.sql"])).toHaveLength(1);
  });

  test("a contiguous run passes", () => {
    expect(
      checkVersionSequence(["0001_ledger.sql", "0002_schema.sql"]),
    ).toEqual([]);
  });
});
