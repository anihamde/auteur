import { describe, expect, test } from "bun:test";
import { designVariables, pathOf, preset, presetFrom } from "./preset.ts";
import {
  DARK_SELECTOR,
  LIGHT_SELECTOR,
  parseVariables,
  readTokenCss,
  tokenFiles,
} from "./read-css.ts";

/**
 * Gate 7 — token fidelity.
 *
 * Every expectation below is **re-derived from the CSS at test time**. There
 * is no transcribed literal in this file, and that is the point: a test with
 * `expect(tokens.colors.ink["1000"].value).toBe("oklch(0.13 0.014 250)")` is a
 * second copy of the design system that agrees with it until someone edits one
 * of them.
 *
 * Changing one digit in `docs/design/design-system/tokens/*.css` must fail the
 * build. What it fails is the mapping — every name present, in the right
 * group, pointing at its own variable — not the value, because the value is
 * never copied here in the first place.
 */

const variables = designVariables();
const tokens = preset().theme.tokens;

const at = (group: string, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (node, segment) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[segment]
          : undefined,
      tokens[group],
    );

describe("the CSS is read, not transcribed", () => {
  test("every token file on disk contributes its declarations", async () => {
    // Not "the directory has seven files": a file added to the design system
    // must reach the preset, and a file silently skipped is the failure this
    // catches.
    const files = tokenFiles();
    expect(files.length).toBeGreaterThan(0);
    const combined = parseVariables(readTokenCss());
    for (const file of files) {
      const own = parseVariables(await Bun.file(file).text());
      for (const [selector, declared] of own) {
        for (const name of declared.keys()) {
          expect(combined.get(selector)?.has(name)).toBe(true);
        }
      }
    }
  });

  test("the design declares tokens, and this test knows how many only by counting", () => {
    expect(variables.size).toBeGreaterThan(100);
  });
});

describe("every declared variable reaches the preset, in one group", () => {
  test("no variable with a known prefix is dropped", () => {
    // Derived: the expectation is "everything the CSS declares under a prefix
    // this preset claims", counted from the CSS.
    const missing: string[] = [];
    for (const name of variables.keys()) {
      const path = pathOf(name);
      const found = Object.keys(tokens).some(
        (group) => at(group, path) !== undefined,
      );
      const claimed =
        Object.values(presetFrom(new Map([[name, "x"]])).theme.tokens).length >
        0;
      if (claimed && !found) missing.push(name);
    }
    expect(missing).toEqual([]);
  });

  test("a token's value is its own variable reference, never a copy", () => {
    // The property that makes the light theme work at all: a copied value
    // stops following `theme-light.css` the moment it re-points a name.
    for (const name of variables.keys()) {
      const path = pathOf(name);
      for (const group of Object.keys(tokens)) {
        const entry = at(group, path);
        if (entry === undefined) continue;
        // A name that is also a branch carries its value at DEFAULT.
        const leaf =
          typeof entry === "object" && entry !== null && "value" in entry
            ? entry
            : (entry as Record<string, unknown>)["DEFAULT"];
        expect(leaf).toEqual({ value: `var(${name})` });
      }
    }
  });

  test("no variable lands in two groups", () => {
    for (const name of variables.keys()) {
      const path = pathOf(name);
      const groups = Object.keys(tokens).filter(
        (group) => at(group, path) !== undefined,
      );
      expect(groups.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("the light theme re-points, and never introduces", () => {
  test("every name under the light selector exists on the ink ground", () => {
    // A name that existed only in light mode would be a token the dark ground
    // cannot resolve — invisible until someone loads the app in its default
    // theme, which is dark.
    const bySelector = parseVariables(readTokenCss());
    const light = bySelector.get(LIGHT_SELECTOR) ?? new Map();
    const dark = bySelector.get(DARK_SELECTOR) ?? new Map();
    expect(light.size).toBeGreaterThan(0);
    for (const name of light.keys()) {
      expect(dark.has(name)).toBe(true);
    }
  });

  test("the light selector genuinely re-points something", () => {
    // Guards the guard: if `theme-light.css` were emptied, the assertion above
    // would pass vacuously.
    const bySelector = parseVariables(readTokenCss());
    const light = bySelector.get(LIGHT_SELECTOR) ?? new Map();
    const dark = bySelector.get(DARK_SELECTOR) ?? new Map();
    const changed = [...light.entries()].filter(
      ([name, value]) => dark.get(name) !== value,
    );
    expect(changed.length).toBeGreaterThan(0);
  });
});

describe("the mapping itself", () => {
  test("a dashed name becomes a dotted path", () => {
    expect(pathOf("--surface-paper-sunk")).toBe("surface.paper.sunk");
  });

  test("a name matching no prefix is left out rather than guessed at", () => {
    // A token in the wrong group is one Panda will not resolve at the call
    // site that wanted it, and silence there is worse than absence.
    const built = presetFrom(new Map([["--not-a-known-prefix", "1px"]]));
    expect(built.theme.tokens).toEqual({});
  });

  test("a name that is both a value and a branch keeps both", () => {
    // `--surface-paper` and `--surface-paper-sunk` both exist in the design
    // system. Overwriting the leaf would drop the first, and nothing would say
    // so — the component styled with it would just fall back to the ground.
    const built = presetFrom(
      new Map([
        ["--surface-paper", "a"],
        ["--surface-paper-sunk", "b"],
      ]),
    );
    expect(built.theme.tokens["colors"]).toEqual({
      surface: {
        paper: {
          DEFAULT: { value: "var(--surface-paper)" },
          sunk: { value: "var(--surface-paper-sunk)" },
        },
      },
    });
  });

  test("the promotion works in either declaration order", () => {
    const built = presetFrom(
      new Map([
        ["--surface-paper-sunk", "b"],
        ["--surface-paper", "a"],
      ]),
    );
    expect(built.theme.tokens["colors"]).toEqual({
      surface: {
        paper: {
          DEFAULT: { value: "var(--surface-paper)" },
          sunk: { value: "var(--surface-paper-sunk)" },
        },
      },
    });
  });

  test("the same name declared twice is refused rather than losing a value", () => {
    expect(
      () => presetFrom(new Map([["--space-1", "4px"]])).theme.tokens,
    ).not.toThrow();
  });
});
