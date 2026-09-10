import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Glob } from "bun";

/**
 * The app's `tsconfig.json` names every directory its own source lives in.
 *
 * `include` said `api` for four work packages after the routes moved to
 * `server/`, and naming a directory that does not exist is not an error — so
 * the deployed routes were type-checked only where a test happened to import
 * them, and `entry.ts`, which nothing imports, was type-checked nowhere. It had
 * lost a function to a refactor and kept the call to it; every stage invocation
 * threw `selfOrigin is not defined` into a `void`ed promise.
 *
 * Two assertions, because the failure has two halves: a name that no longer
 * matches anything, and a directory nothing names.
 */

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const APPS = join(ROOT, "apps");

const SKIPPED = new Set([
  "node_modules",
  "dist",
  "public",
  ".vercel",
  ".turbo",
]);

const appNames = async (): Promise<string[]> => {
  const entries = await readdir(APPS, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((e) => e.name);
};

const includeOf = async (app: string): Promise<string[]> => {
  const raw = await readFile(join(APPS, app, "tsconfig.json"), "utf8");
  const parsed: unknown = JSON.parse(raw);
  const include =
    typeof parsed === "object" && parsed !== null && "include" in parsed
      ? parsed.include
      : undefined;
  if (!Array.isArray(include)) {
    throw new Error(`${app}/tsconfig.json has no include array`);
  }
  return include.map(String);
};

/** Top-level directories under the app that hold TypeScript this app owns. */
const sourceDirs = async (app: string): Promise<string[]> => {
  const dir = join(APPS, app);
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIPPED.has(entry.name)) continue;
    const glob = new Glob("**/*.{ts,tsx}");
    for await (const _ of glob.scan({ cwd: join(dir, entry.name) })) {
      found.push(entry.name);
      break;
    }
  }
  return found;
};

describe("an app type-checks the code it deploys", () => {
  test("every included directory exists", async () => {
    for (const app of await appNames()) {
      const entries = await readdir(join(APPS, app), { withFileTypes: true });
      const present = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      // A name that matches nothing is not a tsc error, which is why this is a
      // test: `include: ["api"]` stayed green for four work packages after
      // `api/` became `server/`.
      expect({ app, include: await includeOf(app) }).toEqual({
        app,
        include: (await includeOf(app)).filter((named) =>
          present.includes(named),
        ),
      });
    }
  });

  test("every directory holding TypeScript is included", async () => {
    for (const app of await appNames()) {
      const include = await includeOf(app);
      expect({ app, dirs: await sourceDirs(app) }).toEqual({
        app,
        dirs: (await sourceDirs(app)).filter((dir) => include.includes(dir)),
      });
    }
  });
});
