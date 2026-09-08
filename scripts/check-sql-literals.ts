#!/usr/bin/env bun
/**
 * CI gate 13: no value is ever interpolated into SQL.
 *
 * `pg` parameterizes. A template literal does not — `` `... WHERE id =
 * ${id}` `` builds a new statement text per call, which defeats the plan cache
 * and, the moment `id` comes from anywhere but a literal in the source, is an
 * injection. The failure is invisible in review because the interpolated form
 * reads exactly like the parameterized one.
 *
 * So: any template literal whose static text looks like SQL may interpolate
 * **nothing**, with one exception — a call to `identifier(...)` from
 * `@auteur/db/sql`, which is the seam for the rare statement that cannot
 * parameterize a table or column name. That function refuses anything which is
 * not a plain identifier rather than escaping it, so the only values that can
 * reach it are ones written in the source.
 *
 * Scanned: every `.ts`/`.tsx` under `packages/*` and `apps/*`, tests included.
 * A test is where an interpolated query is most tempting and least noticed.
 */
import { join, relative } from "node:path";
import { Glob } from "bun";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/**
 * A literal is SQL if its static text contains one of these. Deliberately a
 * keyword list rather than a parse: the cost of a false positive is writing
 * the query differently, and the cost of a false negative is an injection.
 */
const SQL_MARKER =
  /\b(select\s|insert\s+into\s|update\s+\w|delete\s+from\s|create\s+(table|index|unique|schema|database)\s|alter\s+table\s|drop\s+(table|schema|database)\s|truncate\s|listen\s|notify\s|values\s*\(|from\s+\w+\s+where\s)/i;

/** `identifier(x)`, the one permitted interpolation. */
const IDENTIFIER_CALL = /^\s*identifier\s*\(/;

export type Finding = {
  readonly file: string;
  readonly line: number;
  readonly expression: string;
};

type Span = { readonly start: number; readonly end: number };

/**
 * Every top-level template literal in `source`, with its interpolated spans.
 *
 * Hand-rolled rather than parsed: the scan has to know the difference between a
 * backtick in code and one inside a comment or a quoted string, which a regex
 * cannot, and pulling in a full parser to find backticks is not worth it.
 */
const templateLiterals = (
  source: string,
): { text: string; start: number; expressions: Span[] }[] => {
  const found: { text: string; start: number; expressions: Span[] }[] = [];
  let index = 0;

  const skipLineComment = (): void => {
    while (index < source.length && source[index] !== "\n") index += 1;
  };
  const skipBlockComment = (): void => {
    index += 2;
    while (index < source.length && source.slice(index, index + 2) !== "*/") {
      index += 1;
    }
    index += 2;
  };
  const skipQuoted = (quote: string): void => {
    index += 1;
    while (index < source.length && source[index] !== quote) {
      if (source[index] === "\\") index += 1;
      index += 1;
    }
    index += 1;
  };

  /** Reads a template literal starting at the backtick under `index`. */
  const readTemplate = (): void => {
    const start = index;
    index += 1;
    let text = "";
    const expressions: Span[] = [];
    while (index < source.length && source[index] !== "`") {
      if (source[index] === "\\") {
        index += 2;
        continue;
      }
      if (source.slice(index, index + 2) === "${") {
        const exprStart = index + 2;
        index = exprStart;
        // Brace depth, so a nested object or template inside the expression
        // does not end it early.
        let depth = 1;
        while (index < source.length && depth > 0) {
          const char = source[index];
          if (char === "{") depth += 1;
          else if (char === "}") depth -= 1;
          else if (char === "'" || char === '"') {
            skipQuoted(char);
            continue;
          } else if (char === "`") {
            readTemplate();
            continue;
          }
          index += 1;
        }
        expressions.push({ end: index - 1, start: exprStart });
        continue;
      }
      text += source[index];
      index += 1;
    }
    index += 1;
    found.push({ expressions, start, text });
  };

  while (index < source.length) {
    const two = source.slice(index, index + 2);
    if (two === "//") {
      skipLineComment();
      continue;
    }
    if (two === "/*") {
      skipBlockComment();
      continue;
    }
    const char = source[index];
    if (char === "'" || char === '"') {
      skipQuoted(char);
      continue;
    }
    if (char === "`") {
      readTemplate();
      continue;
    }
    index += 1;
  }

  return found;
};

const lineOf = (source: string, offset: number): number =>
  source.slice(0, offset).split("\n").length;

export const findInterpolatedSql = (
  file: string,
  source: string,
): Finding[] => {
  const findings: Finding[] = [];
  for (const literal of templateLiterals(source)) {
    if (literal.expressions.length === 0) continue;
    if (!SQL_MARKER.test(literal.text)) continue;
    for (const span of literal.expressions) {
      const expression = source.slice(span.start, span.end);
      if (IDENTIFIER_CALL.test(expression)) continue;
      findings.push({
        expression: expression.trim(),
        file,
        line: lineOf(source, span.start),
      });
    }
  }
  return findings;
};

const scan = async (): Promise<Finding[]> => {
  const findings: Finding[] = [];
  for (const root of ["packages", "apps"]) {
    const glob = new Glob("*/{src,tests}/**/*.{ts,tsx}");
    for await (const relativePath of glob.scan({
      cwd: join(ROOT, root),
      onlyFiles: true,
    })) {
      const path = join(ROOT, root, relativePath);
      const source = await Bun.file(path).text();
      findings.push(
        ...findInterpolatedSql(
          relative(ROOT, path).replaceAll("\\", "/"),
          source,
        ),
      );
    }
  }
  return findings;
};

if (import.meta.main) {
  const findings = await scan();
  if (findings.length > 0) {
    for (const finding of findings) {
      process.stderr.write(
        `${finding.file}:${finding.line.toString()} interpolates \`${finding.expression}\` into SQL\n`,
      );
    }
    process.stderr.write(
      `\n${findings.length.toString()} interpolation(s) into SQL. Pass values as $1, $2 … and, for a table or column name, wrap it in \`identifier()\` from @auteur/db/sql.\n`,
    );
    process.exit(1);
  }
  process.stdout.write("No SQL is built by interpolation.\n");
}
