/**
 * The closed icon set.
 *
 * `ARCHITECTURE.md` §2 calls for ten glyphs; `docs/design/wizard-handoff`
 * uses eight. This list settles the set — see
 * `docs/decisions/0008-the-icon-set.md` for the two that were added and why.
 *
 * The set is closed because the icon vocabulary is part of the visual
 * language, and an interface where any of a thousand glyphs may appear has no
 * vocabulary. Adding one is an edit here, which is a reviewable diff — that is
 * the point rather than a side effect.
 *
 * Names are Lucide's, kebab-case, exactly as the design system writes them.
 */
export const ICON_NAMES = [
  /** A completed wizard step, and a passing measure. */
  "check",
  /** A disclosure, and the select control's affordance. */
  "chevron-down",
  /** The forward action on every step. */
  "arrow-right",
  /** Back, on the rail and in the overlay. */
  "arrow-left",
  /** Regenerate: the outline again, or one selection. */
  "git-branch",
  /** Elapsed time, on the status bar and the stage rows. */
  "clock",
  /** The light ground, in the theme toggle. */
  "sun",
  /** The ink ground, in the theme toggle. */
  "moon",
  /** Author search. The prototype's one glyph that §2's list omits. */
  "search",
  /** Dismiss the model overlay. The prototype's other omission. */
  "x",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const isIconName = (value: string): value is IconName =>
  (ICON_NAMES as readonly string[]).includes(value);

/** The three sizes, from `ARCHITECTURE.md` §2 and the design's `Icon.d.ts`. */
export const ICON_SIZES = [14, 16, 20] as const;
export type IconSize = (typeof ICON_SIZES)[number];
