import {
  DARK_SELECTOR,
  LIGHT_SELECTOR,
  parseVariables,
  readTokenCss,
} from "./read-css.ts";

/**
 * The Panda preset, derived from the design CSS rather than transcribed.
 *
 * `ARCHITECTURE.md` §8.1: the visual system arrives from `docs/design/` and
 * must not drift. A preset written by hand from those files would be correct
 * on the day it was written; one derived from them is correct on every day.
 *
 * Every token here is a `var(--name)` pointing at the CSS that already ships,
 * not a copy of its value. That is deliberate and it is what makes the light
 * theme work: `theme-light.css` re-points the semantic aliases under
 * `[data-theme="light"]`, so a component styled with `token(colors.surface.app)`
 * follows the theme without Panda knowing there is one.
 */

export type TokenGroup =
  | "colors"
  | "spacing"
  | "radii"
  | "shadows"
  | "fonts"
  | "fontSizes"
  | "fontWeights"
  | "lineHeights"
  | "letterSpacings"
  | "sizes"
  | "durations"
  | "easings"
  | "blurs"
  | "borderWidths"
  | "gradients";

/**
 * Which group a variable belongs to, from its prefix.
 *
 * Prefix-driven so that adding `--space-11` to the CSS adds a spacing token
 * with no edit here. A name matching nothing is **kept out** rather than
 * guessed at: a token in the wrong group is a token Panda will not resolve at
 * the call site that wanted it, and silence there is worse than absence.
 */
const GROUP_BY_PREFIX: readonly (readonly [string, TokenGroup])[] = [
  ["--ink-", "colors"],
  ["--paper-", "colors"],
  ["--prussian-", "colors"],
  ["--amber-", "colors"],
  ["--laurel-", "colors"],
  ["--oxblood-", "colors"],
  ["--surface-", "colors"],
  ["--text-3", "fontSizes"],
  ["--text-2", "fontSizes"],
  ["--text-", "fontSizes"],
  ["--border-", "colors"],
  ["--link", "colors"],
  ["--space-", "spacing"],
  ["--gutter-", "spacing"],
  ["--stack", "spacing"],
  ["--inline", "spacing"],
  ["--radius-", "radii"],
  ["--shadow-", "shadows"],
  ["--ring-", "shadows"],
  ["--font-", "fonts"],
  ["--weight-", "fontWeights"],
  ["--leading-", "lineHeights"],
  ["--tracking-", "letterSpacings"],
  ["--rail-", "sizes"],
  ["--topbar-", "sizes"],
  ["--statusbar-", "sizes"],
  ["--control-height", "sizes"],
  ["--measure", "sizes"],
  ["--dur-", "durations"],
  ["--ease-", "easings"],
  ["--blur-", "blurs"],
  ["--rule-", "borderWidths"],
  ["--fade-", "gradients"],
];

const groupOf = (name: string): TokenGroup | undefined => {
  const match = GROUP_BY_PREFIX.find(([prefix]) => name.startsWith(prefix));
  return match?.[1];
};

/**
 * `--surface-paper-sunk` becomes `surface.paper.sunk`.
 *
 * Dots rather than dashes because Panda addresses tokens by path, and a
 * component asking for `colors.surface.app` reads as what it is. A numeric
 * segment stays a segment: `ink.1000` is the ramp step, not a decimal.
 */
export const pathOf = (name: string): string =>
  name.replace(/^--/, "").replaceAll("-", ".");

export type TokenEntry = { readonly value: string };
export type TokenTree = { [key: string]: TokenTree | TokenEntry };

/**
 * Panda's key for "the token at this path itself".
 *
 * The design system has both `--surface-paper` and `--surface-paper-sunk`, so
 * `surface.paper` must be a value *and* a branch. Panda spells that `DEFAULT`,
 * and `token(colors.surface.paper)` resolves to it.
 */
export const DEFAULT_KEY = "DEFAULT";

const branchAt = (node: TokenTree, segment: string): TokenTree => {
  const existing = node[segment];
  if (existing === undefined) {
    const created: TokenTree = {};
    node[segment] = created;
    return created;
  }
  if ("value" in existing) {
    // A leaf that now needs children: it becomes the branch's DEFAULT rather
    // than being overwritten. Overwriting would drop `--surface-paper` the
    // moment `--surface-paper-sunk` was declared, and nothing would say so.
    const promoted: TokenTree = { [DEFAULT_KEY]: existing };
    node[segment] = promoted;
    return promoted;
  }
  return existing;
};

const insert = (tree: TokenTree, path: string, value: string): void => {
  const segments = path.split(".");
  const last = segments.pop();
  if (last === undefined) return;

  let node = tree;
  for (const segment of segments) {
    node = branchAt(node, segment);
  }

  const existing = node[last];
  if (existing !== undefined && !("value" in existing)) {
    // The branch was created first: this is its own value.
    existing[DEFAULT_KEY] = { value };
    return;
  }
  if (existing !== undefined) {
    throw new Error(
      `token path ${path} is declared twice, so one of the two values would be lost`,
    );
  }
  node[last] = { value };
};

export type Preset = {
  readonly theme: {
    readonly tokens: Readonly<Record<string, TokenTree>>;
  };
};

/**
 * Build the preset from a parsed CSS map.
 *
 * Exported separately from `preset` so the test can build one from CSS it
 * supplies and assert the mapping itself, rather than only the result of
 * reading the repository.
 */
export const presetFrom = (variables: ReadonlyMap<string, string>): Preset => {
  const tokens: Record<string, TokenTree> = {};
  for (const [name] of variables) {
    const group = groupOf(name);
    if (group === undefined) continue;
    const tree = tokens[group] ?? {};
    tokens[group] = tree;
    // The **variable reference**, not the value. A copied value is a value
    // that stops following the theme the moment `theme-light.css` re-points it.
    insert(tree, pathOf(name), `var(${name})`);
  }
  return { theme: { tokens } };
};

/** Every variable the design CSS declares, dark ground first. */
export const designVariables = (): Map<string, string> => {
  const bySelector = parseVariables(readTokenCss());
  const dark = bySelector.get(DARK_SELECTOR) ?? new Map<string, string>();
  const light = bySelector.get(LIGHT_SELECTOR) ?? new Map<string, string>();
  // The light selector adds no names — it re-points the ones the dark ground
  // already declares — and this asserts that rather than assuming it, because a
  // name that existed only in light mode would be a token the dark ground
  // could not resolve.
  for (const name of light.keys()) {
    if (!dark.has(name)) {
      throw new Error(
        `${name} is declared only under ${LIGHT_SELECTOR}, so it has no value on the ink ground`,
      );
    }
  }
  return dark;
};

export const preset = (): Preset => presetFrom(designVariables());
