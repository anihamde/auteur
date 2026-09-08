import { describe, expect, test } from "bun:test";
import { pinnedVersions } from "./check.ts";
import { parseWindow } from "./config.ts";
import { findViolations, type Release, render } from "./find-violations.ts";

const NOW = new Date("2026-09-08T00:00:00Z");
const DAY = 86_400_000;
const WEEK = 604_800;

const release = (daysAgo: number | undefined): Release => ({
  name: "left-pad",
  publishedAt:
    daysAgo === undefined ? undefined : new Date(NOW.getTime() - daysAgo * DAY),
  version: "1.0.0",
});

describe("the window is read, not restated", () => {
  test("it comes from bunfig.toml", () => {
    // Bun enforces it on an install and this package on the lockfile — two
    // halves of one rule, so a second copy of the number is the two halves
    // disagreeing.
    expect(parseWindow("[install]\nminimumReleaseAge = 604800\n")).toBe(WEEK);
  });

  test("a bunfig with no setting is an error, not a default", () => {
    expect(() => parseWindow("[install]\n")).toThrow(/nothing here to agree/);
  });
});

describe("what counts as a violation", () => {
  test("a version older than the window passes", () => {
    expect(findViolations([release(8)], WEEK, NOW)).toEqual([]);
  });

  test("a version younger than the window fails, with its age", () => {
    const violations = findViolations([release(2)], WEEK, NOW);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.why).toContain("2.0 days ago");
  });

  test("exactly at the boundary passes", () => {
    // The window is "at least this old", so seven days is old enough. Writing
    // the boundary down is what stops it from moving by accident.
    expect(findViolations([release(7)], WEEK, NOW)).toEqual([]);
  });

  test("a version the registry cannot date is reported, not assumed fine", () => {
    // "Probably fine" is how a malicious release gets in.
    const violations = findViolations([release(undefined)], WEEK, NOW);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.ageSeconds).toBeUndefined();
    expect(violations[0]?.why).toContain("no publish date");
  });
});

describe("reading the lockfile", () => {
  test("it finds scoped and unscoped pins", () => {
    const lock = `{
      "packages": {
        "zod": ["zod@4.4.3", {}, "sha"],
        "@types/react": ["@types/react@19.2.18", {}, "sha"]
      }
    }`;
    const pinned = pinnedVersions(lock);
    expect(
      pinned.map((entry) => `${entry.name}@${entry.version}`).sort(),
    ).toEqual(["@types/react@19.2.18", "zod@4.4.3"]);
  });

  test("workspace packages are excluded", () => {
    // They are this repository's own, and the registry has never heard of them.
    expect(pinnedVersions(`"@auteur/core@1.0.0"`)).toEqual([]);
  });

  test("the same pin appearing twice is checked once", () => {
    expect(pinnedVersions(`"zod@4.4.3" "zod@4.4.3"`)).toHaveLength(1);
  });
});

describe("the report", () => {
  test("a clean run says how many it checked", () => {
    // "ok" with no count is a gate nobody can tell was blind.
    expect(render([], 240)).toContain("240 pinned versions");
  });

  test("a failing run names each package and version", () => {
    expect(render(findViolations([release(1)], WEEK, NOW), 1)).toContain(
      "left-pad@1.0.0",
    );
  });
});
