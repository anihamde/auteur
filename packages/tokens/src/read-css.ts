import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The design CSS, read at the moment it is needed.
 *
 * `docs/design/design-system/tokens/*.css` is the source of truth for every
 * token in this repository — `ARCHITECTURE.md` §8.1 — and this package is a
 * translation of it into Panda's shape, never a second copy of it. So the CSS
 * is **read**, at build time and at test time, rather than transcribed.
 *
 * That is what makes gate 7 mean something: the preset test re-reads these
 * files and re-derives every expectation, so changing one digit in the CSS
 * fails the build rather than producing a preset that quietly disagrees with
 * the design.
 *
 * Reading files at module load is acceptable here and nowhere else in this
 * codebase: this package is consumed by `panda.config.ts` and by its own test,
 * both of which run in Bun on a checkout. Nothing in `apps/` imports it at run
 * time — the generated CSS is what ships.
 */

const TOKENS_DIRECTORY = "docs/design/design-system/tokens";

/** Walk up from this module until the repository root is underfoot. */
const repositoryRoot = (): string => {
  let directory = dirname(new URL(import.meta.url).pathname);
  for (let depth = 0; depth < 10; depth += 1) {
    try {
      readdirSync(join(directory, TOKENS_DIRECTORY));
      return directory;
    } catch {
      directory = dirname(directory);
    }
  }
  throw new Error(
    `${TOKENS_DIRECTORY} is not above ${new URL(import.meta.url).pathname}. The design tokens are the source of truth for this package and it cannot be built without them.`,
  );
};

export const tokenFiles = (): readonly string[] => {
  const directory = join(repositoryRoot(), TOKENS_DIRECTORY);
  return readdirSync(directory)
    .filter((name) => name.endsWith(".css"))
    .sort()
    .map((name) => join(directory, name));
};

export const readTokenCss = (): string =>
  tokenFiles()
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

/**
 * Every `--name: value` declaration, by selector.
 *
 * A hand-rolled scan rather than a CSS parser: the input is a handful of
 * files this repository owns, written in one shape, and a parser would be a
 * dependency carrying a grammar for everything these files do not use.
 *
 * The selector matters because `theme-light.css` re-points the same names
 * under `:root[data-theme="light"]`. Keeping them separate is what lets the
 * preset put the light values in a condition instead of overwriting the dark
 * ones — see `conditions.ts`.
 */
export const parseVariables = (
  css: string,
): Map<string, Map<string, string>> => {
  const bySelector = new Map<string, Map<string, string>>();
  // Comments first. A block's selector is whatever precedes its brace, and a
  // comment sitting above the block is part of that text — so
  // `:root[data-theme="light"]` would not be recognised at all.
  const source = css.replaceAll(/\/\*[\s\S]*?\*\//g, "");

  // Depth-aware rather than a flat regex over `([^{}]+)\{([^{}]*)\}`.
  // `base.css` carries `@keyframes auteur-spin{to{...}}`, and a flat match
  // consumes the inner block and leaves the outer `}` behind — which then
  // pairs with the *next* file's selector and swallows a whole `:root` block.
  // The symptom is a token silently missing from the preset, which is exactly
  // the failure this package exists to make impossible.
  let index = 0;
  let selectorStart = 0;
  while (index < source.length) {
    const character = source[index];
    if (character !== "{") {
      index += 1;
      continue;
    }
    // Only the last statement before the brace is the selector. `fonts.css`
    // ends with an `@import ...;` and no block, so without this the next
    // file's `:root` arrives glued to that import and matches nothing — which
    // dropped every spacing token and said nothing about it.
    const selector = (
      source.slice(selectorStart, index).split(";").at(-1) ?? ""
    ).trim();
    let depth = 1;
    let cursor = index + 1;
    while (cursor < source.length && depth > 0) {
      const inner = source[cursor];
      if (inner === "{") depth += 1;
      else if (inner === "}") depth -= 1;
      cursor += 1;
    }
    if (selector.startsWith(":root")) {
      const values = bySelector.get(selector) ?? new Map<string, string>();
      for (const declaration of source
        .slice(index + 1, cursor - 1)
        .split(";")) {
        const at = declaration.indexOf(":");
        if (at === -1) continue;
        const name = declaration.slice(0, at).trim();
        if (!name.startsWith("--")) continue;
        values.set(name, declaration.slice(at + 1).trim());
      }
      bySelector.set(selector, values);
    }
    index = cursor;
    selectorStart = cursor;
  }
  return bySelector;
};

export const DARK_SELECTOR = ":root";
export const LIGHT_SELECTOR = ':root[data-theme="light"]';
