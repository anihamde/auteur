// biome-ignore-all lint/suspicious/noTemplateCurlyInString: every fixture here
// is a `${...}` inside an ordinary string on purpose — it is the input the
// scanner under test reads.
import { describe, expect, test } from "bun:test";
import { findInterpolatedSql } from "./check-sql-literals.ts";

const find = (source: string) => findInterpolatedSql("probe.ts", source);

describe("a value interpolated into SQL is a finding", () => {
  test("the injection that reads exactly like the parameterized form", () => {
    const findings = find(
      "const row = await db.query(`SELECT * FROM sessions WHERE id = ${id}`);",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.expression).toBe("id");
  });

  test("an INSERT built from a variable", () => {
    expect(
      find("db.query(`INSERT INTO events (type) VALUES ('${type}')`)"),
    ).toHaveLength(1);
  });

  test("every interpolation in one literal is reported, not just the first", () => {
    expect(
      find("db.query(`SELECT * FROM t WHERE a = ${a} AND b = ${b}`)"),
    ).toHaveLength(2);
  });

  test("the line reported is the line the interpolation is on", () => {
    const findings = find("const a = 1;\n\ndb.query(`SELECT ${x} FROM t`);");
    expect(findings[0]?.line).toBe(3);
  });
});

describe("identifier() is the one permitted interpolation", () => {
  test("a table name wrapped in identifier() passes", () => {
    // The seam for the rare statement that cannot parameterize a name.
    // `identifier` refuses anything that is not a plain identifier rather than
    // escaping it, so only values written in the source can reach it.
    expect(
      find("db.query(`SELECT count(*) FROM ${identifier(table)}`)"),
    ).toEqual([]);
  });

  test("but a bare table name does not", () => {
    expect(find("db.query(`SELECT count(*) FROM ${table}`)")).toHaveLength(1);
  });

  test("columns() is permitted too, for the list form", () => {
    expect(
      find("db.query(`SELECT ${columns(COLUMNS)} FROM events WHERE id = $1`)"),
    ).toEqual([]);
  });

  test("a bare column-list constant does not pass", () => {
    // A module constant looks safe and usually is, but nothing checks that it
    // holds literal column names — which is exactly what `columns()` does.
    expect(
      find("db.query(`SELECT ${COLUMNS} FROM events WHERE id = $1`)"),
    ).toHaveLength(1);
  });
});

describe("what is not SQL is not scanned", () => {
  test("an ordinary template literal is left alone", () => {
    expect(find("const label = `session ${id} is ${step}`;")).toEqual([]);
  });

  test("a backtick inside a line comment does not open a literal", () => {
    // The scanner has to know the difference between a backtick in code and
    // one in a comment, or the rest of the file is read as string content and
    // every real query after it goes unscanned.
    expect(
      find(
        "// see `SELECT * FROM t WHERE id = x`\ndb.query(`SELECT * FROM t WHERE id = ${id}`);",
      ),
    ).toHaveLength(1);
  });

  test("a backtick inside a quoted string does not open a literal", () => {
    expect(
      find(
        'const s = "a ` backtick";\ndb.query(`DELETE FROM t WHERE id = ${id}`);',
      ),
    ).toHaveLength(1);
  });

  test("an escaped backtick does not close a literal", () => {
    expect(find("const s = `a \\` b ${x} c`;")).toEqual([]);
  });

  test("a nested template inside the expression does not end it early", () => {
    const findings = find(
      "db.query(`SELECT * FROM t WHERE id = ${wrap(`${inner}`)}`);",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.expression).toBe("wrap(`${inner}`)");
  });

  test("an object literal inside the expression does not end it early", () => {
    const findings = find(
      "db.query(`SELECT * FROM t WHERE id = ${f({ a: 1 })}`);",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.expression).toBe("f({ a: 1 })");
  });
});
