import type {
  CSSProperties,
  HTMLAttributes,
  ReactElement,
  ReactNode,
} from "react";
import { GROUNDS, type Ground, token } from "../styles.ts";

/**
 * A surface.
 *
 * `ground="paper"` is reserved for story prose and verbatim exemplars — the
 * artifact. Everything else is instrument chrome. The distinction is the design
 * system's central one and it is a prop rather than a separate component
 * because the same card holds either.
 */
export type CardProps = HTMLAttributes<HTMLDivElement> & {
  readonly ground?: Ground;
  readonly padding?: "none" | "sm" | "md" | "lg";
  readonly interactive?: boolean;
  readonly selected?: boolean;
  /** A 3px top rule. A provenance or status token, never an arbitrary colour. */
  readonly accent?: string;
  readonly children?: ReactNode;
};

const PADDING = {
  lg: token("gutter-panel"),
  md: token("gutter-card"),
  none: token("space-0"),
  sm: token("gutter-card-tight"),
} as const;

export const Card = ({
  accent,
  children,
  ground = "ink",
  interactive = false,
  padding = "md",
  selected = false,
  style,
  ...rest
}: CardProps): ReactElement => (
  <div
    data-ground={ground}
    data-selected={selected ? "true" : undefined}
    style={{
      borderRadius:
        ground === "paper" ? token("radius-paper") : token("radius-card"),
      boxShadow:
        ground === "paper" ? token("shadow-paper") : token("shadow-card"),
      cursor: interactive ? "pointer" : "auto",
      padding: PADDING[padding],
      ...GROUNDS[ground],
      ...(selected && {
        borderColor: token("border-strong"),
        outlineColor: token("prussian-500"),
        outlineStyle: "solid",
        outlineWidth: token("rule-hairline"),
      }),
      // Longhands, not the `border-top` shorthand. A shorthand whose value
      // contains `var()` cannot be parsed by the CSSOM and is dropped
      // silently — in a browser as well as in the test's DOM — so the rule
      // would simply not appear.
      ...(accent !== undefined && {
        borderTopColor: accent,
        borderTopStyle: "solid",
        borderTopWidth: token("rule-accent"),
      }),
      ...style,
    }}
    {...rest}
  >
    {children}
  </div>
);

export type CardHeaderProps = {
  readonly title?: ReactNode;
  /** Uppercase eyebrow above the title. */
  readonly meta?: ReactNode;
  readonly action?: ReactNode;
  readonly style?: CSSProperties;
};

export const CardHeader = ({
  action,
  meta,
  style,
  title,
}: CardHeaderProps): ReactElement => (
  <header
    style={{
      alignItems: "baseline",
      display: "flex",
      gap: token("inline"),
      justifyContent: "space-between",
      marginBottom: token("stack-tight"),
      ...style,
    }}
  >
    <div>
      {meta === undefined ? undefined : (
        <div
          style={{
            color: token("text-muted"),
            fontFamily: token("font-ui"),
            fontSize: token("text-3xs"),
            letterSpacing: token("tracking-wide"),
            textTransform: "uppercase",
          }}
        >
          {meta}
        </div>
      )}
      {title === undefined ? undefined : (
        <h3
          style={{
            fontFamily: token("font-display"),
            fontSize: token("text-lg"),
          }}
        >
          {title}
        </h3>
      )}
    </div>
    {action}
  </header>
);
