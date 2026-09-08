#!/usr/bin/env bun
/**
 * CI gate 14: migrations ship in expand / migrate / contract order.
 *
 * A deploy replaces functions while earlier invocations are still finishing, so
 * for a window the old code and the new schema are live together
 * (`ARCHITECTURE.md` §3.3). One file that both adds a column and drops the one
 * it replaces breaks that window in the way that is hardest to see in review:
 * the migration runs, the new code works, and every request still being served
 * by the previous version fails on a column that is no longer there.
 *
 * So a destructive statement — `DROP COLUMN`, `DROP TABLE`, `RENAME`, a
 * `NOT NULL` added to an existing column, a narrowing type change — may not
 * appear in a file that also adds something. Contraction is its own migration,
 * in its own deploy, after the code that read the old shape has stopped
 * running.
 *
 * Also checked here, because they are the same file set:
 *
 *  - Versions are contiguous from 0001 with no gaps and no duplicates. A gap
 *    means a migration was deleted after being applied somewhere.
 *  - The generated manifest matches the files on disk. It is committed, and a
 *    stale one is a database that silently stops migrating.
 *  - No migration is edited after being named in the committed manifest with a
 *    different checksum — the same rule `ensureSchema()` enforces at run time,
 *    caught here instead of on the first boot after the deploy.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SQL_DIR = join(ROOT, "packages/migrations/sql");
const MANIFEST = join(ROOT, "packages/migrations/src/generated/manifest.ts");

/** Comments and string literals are not statements. */
export const stripSqlNoise = (sql: string): string =>
  sql
    .replaceAll(/--[^\n]*/g, " ")
    .replaceAll(/\/\*[\s\S]*?\*\//g, " ")
    .replaceAll(/'(?:[^']|'')*'/g, " '' ");

export type Violation = { readonly file: string; readonly reason: string };

const DESTRUCTIVE: readonly { pattern: RegExp; what: string }[] = [
  { pattern: /\bdrop\s+column\b/i, what: "DROP COLUMN" },
  { pattern: /\bdrop\s+table\b/i, what: "DROP TABLE" },
  { pattern: /\bdrop\s+(?:materialized\s+)?view\b/i, what: "DROP VIEW" },
  { pattern: /\brename\s+(?:column\s+|to\b|constraint\b)/i, what: "RENAME" },
  { pattern: /\bset\s+not\s+null\b/i, what: "SET NOT NULL" },
  {
    pattern: /\balter\s+column\b[\s\S]{0,80}?\btype\b/i,
    what: "ALTER COLUMN … TYPE",
  },
];

const ADDITIVE: readonly { pattern: RegExp; what: string }[] = [
  { pattern: /\badd\s+column\b/i, what: "ADD COLUMN" },
  { pattern: /\bcreate\s+table\b/i, what: "CREATE TABLE" },
  { pattern: /\bcreate\s+(?:unique\s+)?index\b/i, what: "CREATE INDEX" },
  { pattern: /\badd\s+constraint\b/i, what: "ADD CONSTRAINT" },
];

/**
 * The expand/contract rule for one file.
 *
 * `0001` and `0002` are the schema's origin: everything is a `CREATE TABLE` and
 * there is nothing live to break, so the rule starts applying at `0003`.
 */
export const checkOneMigration = (
  file: string,
  version: number,
  sql: string,
): Violation[] => {
  if (version <= 2) return [];
  const body = stripSqlNoise(sql);
  const destructive = DESTRUCTIVE.filter(({ pattern }) => pattern.test(body));
  if (destructive.length === 0) return [];
  const additive = ADDITIVE.filter(({ pattern }) => pattern.test(body));
  if (additive.length === 0) return [];
  return [
    {
      file,
      reason:
        `${destructive.map((entry) => entry.what).join(", ")} in the same file as ` +
        `${additive.map((entry) => entry.what).join(", ")}. ` +
        "A deploy serves the previous version's invocations while this runs, so " +
        "expand and contract go in separate migrations: add now, drop in a later one.",
    },
  ];
};

export const checkVersionSequence = (files: readonly string[]): Violation[] => {
  const violations: Violation[] = [];
  const seen = new Set<number>();
  files.forEach((file, index) => {
    const match = /^(\d{4})_(.+)\.sql$/.exec(file);
    if (match?.[1] === undefined) {
      violations.push({
        file,
        reason:
          "is not named NNNN_name.sql, so its order in the ledger is undefined",
      });
      return;
    }
    const version = Number.parseInt(match[1], 10);
    if (seen.has(version)) {
      violations.push({ file, reason: `repeats version ${match[1]}` });
      return;
    }
    seen.add(version);
    if (version !== index + 1) {
      violations.push({
        file,
        reason: `is version ${version.toString()} but sits at position ${(index + 1).toString()}. Versions are contiguous from 0001; a gap means an applied migration was deleted.`,
      });
    }
  });
  return violations;
};

const main = async (): Promise<number> => {
  const files = (await readdir(SQL_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const violations: Violation[] = [...checkVersionSequence(files)];

  for (const file of files) {
    const match = /^(\d{4})_/.exec(file);
    if (match?.[1] === undefined) continue;
    const sql = await Bun.file(join(SQL_DIR, file)).text();
    violations.push(
      ...checkOneMigration(file, Number.parseInt(match[1], 10), sql),
    );
  }

  // The committed manifest must be what the files generate. A stale one is a
  // database that silently stops migrating — the failure this package's build
  // step exists to prevent, so it is checked rather than trusted.
  const manifest = await Bun.file(MANIFEST).text();
  for (const file of files) {
    const sql = await Bun.file(join(SQL_DIR, file)).text();
    const checksum = Bun.hash(sql).toString(16).padStart(16, "0");
    if (!manifest.includes(`"${checksum}"`)) {
      violations.push({
        file,
        reason:
          "is not in packages/migrations/src/generated/manifest.ts with this checksum. " +
          "Run `bun run build` in packages/migrations and commit the result.",
      });
    }
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      process.stderr.write(`${violation.file} ${violation.reason}\n`);
    }
    return 1;
  }
  process.stdout.write(
    `${files.length.toString()} migration(s): contiguous, expand-before-contract, manifest current.\n`,
  );
  return 0;
};

if (import.meta.main) {
  process.exit(await main());
}
