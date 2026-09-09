import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import {
  CONTROL_HEIGHTS,
  type ControlSize,
  DISABLED,
  token,
} from "../styles.ts";

/**
 * The primary action control.
 *
 * `primary` is reserved for the one forward action on a wizard step — the
 * design's rule, and the reason `variant` is a closed union rather than a
 * boolean: two primaries on a screen is a screen with no primary.
 */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "quiet"
  | "danger";

export type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  readonly variant?: ButtonVariant;
  readonly size?: ControlSize;
  readonly loading?: boolean;
  readonly fullWidth?: boolean;
  /** Renders an `<a>` instead of a `<button>`. */
  readonly href?: string;
  readonly children?: ReactNode;
};

const VARIANTS: Readonly<Record<ButtonVariant, Record<string, string>>> = {
  danger: {
    background: token("oxblood-600"),
    borderColor: token("oxblood-500"),
    borderStyle: "solid",
    borderWidth: token("rule-hairline"),
    color: token("paper-050"),
  },
  ghost: {
    background: "transparent",
    borderColor: "transparent",
    borderStyle: "solid",
    borderWidth: token("rule-hairline"),
    color: token("text-muted"),
  },
  primary: {
    background: token("prussian-600"),
    borderColor: token("prussian-500"),
    borderStyle: "solid",
    borderWidth: token("rule-hairline"),
    color: token("paper-050"),
  },
  quiet: {
    background: token("surface-raised"),
    borderColor: token("border-subtle"),
    borderStyle: "solid",
    borderWidth: token("rule-hairline"),
    color: token("text-body"),
  },
  secondary: {
    background: token("surface-card"),
    borderColor: token("border-subtle"),
    borderStyle: "solid",
    borderWidth: token("rule-hairline"),
    color: token("text-body"),
  },
};

export const Button = ({
  children,
  disabled = false,
  fullWidth = false,
  href,
  loading = false,
  size = "md",
  style,
  type = "button",
  variant = "secondary",
  ...rest
}: ButtonProps): ReactElement => {
  const inert = disabled || loading;
  const styles = {
    alignItems: "center",
    borderRadius: token("radius-control"),
    cursor: inert ? DISABLED.cursor : "pointer",
    display: "inline-flex",
    fontFamily: token("font-ui"),
    fontSize: token("text-base"),
    fontWeight: token("weight-medium"),
    gap: token("inline-tight"),
    height: CONTROL_HEIGHTS[size],
    justifyContent: "center",
    // The focus ring is never suppressed; `outline: none` here would be a
    // keyboard user losing their place, and the ring is drawn by the design
    // system's `:focus-visible` rule.
    opacity: inert ? DISABLED.opacity : 1,
    paddingBlock: "0",
    paddingInline: token("space-4"),
    transition: token("transition-control"),
    width: fullWidth ? "100%" : "auto",
    ...VARIANTS[variant],
    ...style,
  };

  const content = (
    <>
      {loading ? (
        <span aria-hidden="true" data-loading="true">
          ·
        </span>
      ) : undefined}
      {children}
    </>
  );

  if (href !== undefined) {
    // A link, because it navigates. A `<button>` styled as a link is not
    // openable in a new tab and is not announced as a link.
    return (
      <a aria-disabled={inert} href={href} style={styles}>
        {content}
      </a>
    );
  }

  return (
    <button
      aria-busy={loading ? true : undefined}
      disabled={inert}
      style={styles}
      type={type}
      {...rest}
    >
      {content}
    </button>
  );
};
