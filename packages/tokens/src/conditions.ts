/**
 * Panda conditions, and the one that is inverted.
 *
 * `ARCHITECTURE.md` §8.1: **dark is the ground.** The ink ramp is what
 * `:root` declares and `theme-light.css` re-points a subset of it under
 * `[data-theme="light"]`. So the condition this design system needs is
 * `_light`, and there is deliberately **no `_dark`**: a `_dark` condition
 * would invite `bg: { base: "white", _dark: "black" }`, which is the shape
 * that produces a flash of the wrong ground on first paint and a component
 * that is only correct in one theme.
 *
 * A token resolves to its ink value with no attribute set. That is the
 * default, and it is the state a page is in before any script has run.
 */
export const conditions = {
  /** The artifact ground. Set by the theme script on `<html>`. */
  _light: '[data-theme="light"] &',
  /**
   * Motion off. §8's rule: the caret and the stream fades collapse to zero
   * rather than being merely shortened — a 40ms flicker is still a flicker.
   */
  _reducedMotion: "@media (prefers-reduced-motion: reduce)",
} as const;

export type ConditionName = keyof typeof conditions;

/**
 * The duration tokens that collapse under `prefers-reduced-motion`.
 *
 * Named rather than "everything beginning with `--dur-`" because that is the
 * claim being made: these five are the animation durations, and a duration
 * added later must be considered rather than swept in. The list is checked
 * against the design CSS by the test, so a renamed token fails rather than
 * silently stopping being collapsed.
 */
export const COLLAPSED_DURATIONS = [
  "--dur-instant",
  "--dur-fast",
  "--dur-base",
  "--dur-slow",
  "--dur-stream",
] as const;

/**
 * The CSS that turns motion off.
 *
 * Emitted as a global rather than expressed per component: a component that
 * had to remember `_reducedMotion` is a component that will forget, and the
 * durations are the one lever that reaches every animation at once.
 */
export const reducedMotionCss = (): string =>
  [
    "@media (prefers-reduced-motion: reduce){",
    ":root{",
    ...COLLAPSED_DURATIONS.map((name) => `${name}:0ms;`),
    "}",
    "*,*::before,*::after{animation-duration:0ms!important;",
    "animation-iteration-count:1!important;",
    "transition-duration:0ms!important;}",
    "}",
  ].join("");
