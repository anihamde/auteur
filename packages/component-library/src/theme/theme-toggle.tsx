import { Icon } from "@auteur/icons/icon";
import { type CSSProperties, type ReactElement, useId } from "react";
import { token } from "../styles.ts";
import { THEME_MODES, type ThemeMode } from "./resolver.ts";

/**
 * Auto / Light / Dark, as a segmented control.
 *
 * Real `<input type="radio">` elements inside a `<fieldset>`, not buttons
 * carrying `role="radio"`. The three are one choice, and the platform's radio
 * gives arrow-key navigation, roving focus and the "Light, 2 of 3"
 * announcement — all of which an ARIA role only *claims*, leaving the
 * behaviour to be reimplemented and half-finished.
 *
 * `auto` has no glyph of its own in the closed icon set, and inventing one
 * would mean opening the set for a label a word states better.
 */
export type ThemeToggleProps = {
  readonly mode?: ThemeMode;
  readonly onChange?: (mode: ThemeMode) => void;
  readonly size?: "sm" | "md";
  /** Show the word beside each glyph. Icon-only by default. */
  readonly showLabels?: boolean;
  readonly style?: CSSProperties;
};

const LABELS: Readonly<Record<ThemeMode, string>> = {
  auto: "Auto",
  dark: "Dark",
  light: "Light",
};

/** Visually hidden, still announced. Not `display: none`, which is not. */
const VISUALLY_HIDDEN: CSSProperties = {
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  height: token("space-px"),
  overflow: "hidden",
  position: "absolute",
  whiteSpace: "nowrap",
  width: token("space-px"),
};

export const ThemeToggle = ({
  mode = "auto",
  onChange,
  showLabels = false,
  size = "md",
  style,
}: ThemeToggleProps): ReactElement => {
  const group = useId();
  return (
    <fieldset
      style={{
        background: token("surface-raised"),
        borderRadius: token("radius-control"),
        borderStyle: "none",
        display: "inline-flex",
        gap: token("space-px"),
        margin: token("space-0"),
        padding: token("space-px"),
        ...style,
      }}
    >
      <legend style={VISUALLY_HIDDEN}>Theme</legend>
      {THEME_MODES.map((candidate) => {
        const selected = candidate === mode;
        return (
          <label
            key={candidate}
            style={{
              alignItems: "center",
              background: selected ? token("surface-card") : "transparent",
              borderRadius: token("radius-xs"),
              color: selected ? token("text-strong") : token("text-muted"),
              cursor: "pointer",
              display: "inline-flex",
              fontFamily: token("font-ui"),
              fontSize: token("text-2xs"),
              gap: token("inline-tight"),
              height: size === "sm" ? token("space-6") : token("space-7"),
              paddingBlock: "0",
              paddingInline: token("space-2"),
            }}
          >
            <input
              checked={selected}
              name={group}
              onChange={() => onChange?.(candidate)}
              style={VISUALLY_HIDDEN}
              type="radio"
              value={candidate}
            />
            {candidate === "light" ? <Icon name="sun" size={14} /> : undefined}
            {candidate === "dark" ? <Icon name="moon" size={14} /> : undefined}
            {showLabels || candidate === "auto" ? (
              LABELS[candidate]
            ) : (
              <span style={VISUALLY_HIDDEN}>{LABELS[candidate]}</span>
            )}
          </label>
        );
      })}
    </fieldset>
  );
};
