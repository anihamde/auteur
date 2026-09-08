#!/usr/bin/env bun
/**
 * `bun run migration:new <name>` — scaffold the next migration file.
 *
 * It writes a file and regenerates the manifest. It does **not** apply
 * anything: nobody runs a migration by hand, in any environment.
 * `ensureSchema()` applies what is outstanding, on access, under a lock.
 *
 * The scaffold is deliberately inert — comments only, no statements — so a
 * scaffolded-and-forgotten migration is a no-op rather than a schema change
 * nobody wrote.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SQL_DIR = join(ROOT, "packages/migrations/sql");

export const slugify = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const nextVersion = (files: readonly string[]): number => {
  const versions = files
    .map((file) => /^(\d{4})_/.exec(file)?.[1])
    .filter((digits): digits is string => digits !== undefined)
    .map((digits) => Number.parseInt(digits, 10));
  return Math.max(0, ...versions) + 1;
};

export const scaffold = (version: number, slug: string): string =>
  [
    `-- ${version.toString().padStart(4, "0")}_${slug}`,
    "--",
    "-- Expand before contract (docs/ARCHITECTURE.md §3.3). A deploy replaces",
    "-- functions while earlier invocations are still finishing, so this file may",
    "-- add a nullable column, an index or a constraint — and the migration that",
    "-- drops or renames what it replaces is a later file, after the code that",
    "-- read the old shape has stopped running. `scripts/check-migrations.ts`",
    "-- fails a file that does both.",
    "--",
    "-- Never edit this file once it has been applied anywhere: the checksum is",
    "-- verified on every boot and a mismatch aborts. Roll forward instead.",
    "",
  ].join("\n");

const main = async (): Promise<number> => {
  const raw = process.argv.slice(2).join(" ");
  const slug = slugify(raw);
  if (slug === "") {
    process.stderr.write(
      "Usage: bun run migration:new <name>\n" +
        "  e.g. bun run migration:new add stage_queue heartbeat\n",
    );
    return 1;
  }

  const files = (await readdir(SQL_DIR)).filter((name) =>
    name.endsWith(".sql"),
  );
  const version = nextVersion(files);
  const file = `${version.toString().padStart(4, "0")}_${slug}.sql`;
  const path = join(SQL_DIR, file);

  if (await Bun.file(path).exists()) {
    process.stderr.write(`${file} already exists.\n`);
    return 1;
  }

  await Bun.write(path, scaffold(version, slug));

  // Regenerate immediately, so the committed manifest is never behind the
  // committed files and gate 14 does not fail on a file the author just made.
  const build = Bun.spawn(["bun", "run", "src/build-manifest.ts"], {
    cwd: join(ROOT, "packages/migrations"),
    stderr: "inherit",
    stdout: "ignore",
  });
  if ((await build.exited) !== 0) return 1;

  process.stdout.write(`packages/migrations/sql/${file}\n`);
  return 0;
};

if (import.meta.main) {
  process.exit(await main());
}
