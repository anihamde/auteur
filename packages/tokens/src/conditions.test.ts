import { describe, expect, test } from "bun:test";
import {
  COLLAPSED_DURATIONS,
  conditions,
  reducedMotionCss,
} from "./conditions.ts";
import { designVariables } from "./preset.ts";

describe("dark is the ground, so the condition is _light", () => {
  test("_light is the attribute selector, and there is no _dark", () => {
    // A `_dark` condition invites `bg: { base: "white", _dark: "black" }`,
    // which is the shape that flashes the wrong ground before the theme script
    // runs and leaves a component correct in only one theme.
    expect(conditions._light).toBe('[data-theme="light"] &');
    expect(Object.keys(conditions)).not.toContain("_dark");
  });

  test("a token resolves to its ink value with no attribute set", () => {
    // The state a page is in before any script has run.
    const variables = designVariables();
    const surface = variables.get("--surface-app");
    const ink = variables.get("--ink-1000");
    expect(surface).toBe("var(--ink-1000)");
    expect(ink).toBeDefined();
  });
});

describe("reduced motion collapses the durations to zero", () => {
  test("every named duration exists in the design CSS", () => {
    // A renamed token fails here rather than silently stopping being
    // collapsed, which is the failure nobody would notice.
    const variables = designVariables();
    for (const name of COLLAPSED_DURATIONS) {
      expect(variables.has(name)).toBe(true);
    }
  });

  test("every duration the design declares is accounted for", () => {
    // The other direction: a duration added later must be considered rather
    // than swept in by a prefix rule or forgotten by an explicit list.
    const declared = [...designVariables().keys()].filter((name) =>
      name.startsWith("--dur-"),
    );
    expect(new Set(declared)).toEqual(new Set(COLLAPSED_DURATIONS));
  });

  test("they collapse to 0ms, not to something merely shorter", () => {
    // A 40ms flicker is still a flicker.
    const css = reducedMotionCss();
    for (const name of COLLAPSED_DURATIONS) {
      expect(css).toContain(`${name}:0ms`);
    }
  });

  test("animations and transitions are stopped as well as shortened", () => {
    // A duration token only reaches the animations that use it.
    const css = reducedMotionCss();
    expect(css).toContain("animation-duration:0ms!important");
    expect(css).toContain("transition-duration:0ms!important");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
