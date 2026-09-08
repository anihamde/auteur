import type { CSSProperties } from "react";

/**
 * The token references components share.
 *
 * Every value here is `var(--token)`, never a literal — see
 * `docs/decisions/0009-components-use-the-css-variables-directly.md`. A
 * hardcoded hex does not follow the theme, and `adherence.test.ts` refuses one.
 *
 * Named once rather than repeated: a token used in four components is a token
 * that will be changed in three of them.
 */

export const token = (name: string): string => `var(--${name})`;

/** The two grounds. §8.1: prose sits on paper, measurement sits on ink. */
export const GROUNDS = {
  ink: {
    background: token("surface-card"),
    color: token("text-body"),
  },
  outline: {
    background: "transparent",
    borderColor: token("border-subtle"),
    borderStyle: "solid",
    borderWidth: token("rule-hairline"),
    color: token("text-body"),
  },
  panel: {
    background: token("surface-panel"),
    color: token("text-body"),
  },
  paper: {
    background: token("surface-paper"),
    color: token("text-paper-body"),
  },
} as const satisfies Record<string, CSSProperties>;

export type Ground = keyof typeof GROUNDS;

/**
 * The control surface, shared by `Input`, `Select` and `Textarea`.
 *
 * The design's `Input.d.ts` exports it as `controlSurface` for exactly this
 * reason: three controls that looked almost the same would be three controls
 * that drifted.
 */
export const controlSurface: CSSProperties = {
  background: token("surface-input"),
  borderColor: token("border-default"),
  borderRadius: token("radius-control"),
  borderStyle: "solid",
  borderWidth: token("rule-hairline"),
  color: token("text-body"),
  fontFamily: token("font-ui"),
  fontSize: token("text-base"),
  outline: "none",
  transition: token("transition-control"),
  width: "100%",
};

export const CONTROL_HEIGHTS = {
  lg: token("control-height-lg"),
  md: token("control-height"),
  sm: token("control-height-sm"),
} as const;

export type ControlSize = keyof typeof CONTROL_HEIGHTS;

/**
 * The focus ring, and the rule that it is never removed.
 *
 * `outline: none` appears above because the ring is drawn as a box-shadow the
 * design system defines; a component that removed the outline and drew nothing
 * in its place is the commonest way a keyboard user loses their place.
 */
export const FOCUS_RING: CSSProperties = {
  boxShadow: token("ring-focus"),
};

/** Disabled, at the handoff's exact weight. */
export const DISABLED: CSSProperties = {
  cursor: "not-allowed",
  opacity: 0.42,
};

/** The tier and status colours, by meaning rather than by hue. */
export const TONES = {
  accent: token("prussian-400"),
  balanced: token("prussian-300"),
  cheap: token("ink-300"),
  edited: token("amber-400"),
  fail: token("oxblood-400"),
  measured: token("laurel-400"),
  neutral: token("text-muted"),
  strong: token("amber-400"),
} as const;

export type Tone = keyof typeof TONES;

export const STATUS_COLOURS = {
  drift: token("amber-400"),
  fail: token("oxblood-400"),
  neutral: token("text-muted"),
  pass: token("laurel-400"),
} as const;

export type Status = keyof typeof STATUS_COLOURS;
