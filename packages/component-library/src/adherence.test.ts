import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * WP-Q1's adherence rule, as a test rather than a lint plugin.
 *
 * Decision 0009: a test can name the file and the literal, and it runs in the
 * same command as everything else. What it enforces is the same claim the
 * oxlint config made — **no hardcoded value where a token exists** — because a
 * hardcoded hex does not follow the theme and a hardcoded duration does not
 * collapse under `prefers-reduced-motion`.
 */

const sources = async (): Promise<Map<string, string>> => {
  const files = new Map<string, string>();
  for await (const relative of new Glob("src/**/*.{ts,tsx}").scan({
    cwd: import.meta.dir.replace(/\/src$/, ""),
  })) {
    if (relative.includes(".test.")) continue;
    files.set(
      relative,
      await Bun.file(
        `${import.meta.dir.replace(/\/src$/, "")}/${relative}`,
      ).text(),
    );
  }
  return files;
};

const offences = async (
  pattern: RegExp,
  allow: (line: string) => boolean = () => false,
): Promise<string[]> => {
  const found: string[] = [];
  for (const [file, source] of await sources()) {
    for (const [index, line] of source.split("\n").entries()) {
      // A comment explaining why a token exists may name a value.
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      if (allow(line)) continue;
      if (pattern.test(line)) {
        found.push(`${file}:${(index + 1).toString()} ${line.trim()}`);
      }
    }
  }
  return found;
};

describe("no component carries a value a token already has", () => {
  test("no hex colour", async () => {
    // A hex does not follow the theme. There are two grounds and it is right
    // in at most one of them.
    expect(await offences(/#[0-9a-fA-F]{3,8}\b/)).toEqual([]);
  });

  test("no rgb, hsl or bare oklch", async () => {
    expect(await offences(/\b(rgba?|hsla?|oklch)\s*\(/)).toEqual([]);
  });

  test("no length in px", async () => {
    // Spacing, radii, control heights and rule weights are all tokens. The one
    // exception is `0`, which needs no unit and no token.
    expect(await offences(/\b\d+px\b/)).toEqual([]);
  });

  test("no duration in ms or s", async () => {
    // A hardcoded duration does not collapse under `prefers-reduced-motion`.
    expect(await offences(/\b\d+(\.\d+)?m?s\b/)).toEqual([]);
  });

  test("no easing curve", async () => {
    expect(await offences(/cubic-bezier\s*\(/)).toEqual([]);
  });

  test("the check is looking at real files", async () => {
    // Guards the guard: an empty glob would make every assertion above pass.
    const files = await sources();
    expect(files.size).toBeGreaterThan(1);
  });
});
