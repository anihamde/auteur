import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { TONES, type Tone, token } from "../styles.ts";

/**
 * A small status or classification label.
 *
 * Tones carry meaning, so they are picked by meaning: `cheap | balanced |
 * strong` are model tiers and `measured | edited` are provenance. There is no
 * `color` prop, because a badge whose colour a caller chose is a badge whose
 * colour means nothing.
 */
export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  readonly tone?: Tone;
  /** Mono, for numbers, ids and schema paths. */
  readonly mono?: boolean;
  readonly children?: ReactNode;
};

export const Badge = ({
  children,
  mono = false,
  style,
  tone = "neutral",
  ...rest
}: BadgeProps): ReactElement => (
  <span
    data-tone={tone}
    style={{
      alignItems: "center",
      borderColor: "currentColor",
      borderRadius: token("radius-xs"),
      borderStyle: "solid",
      borderWidth: token("rule-hairline"),
      color: TONES[tone],
      display: "inline-flex",
      fontFamily: mono ? token("font-data") : token("font-ui"),
      fontSize: token("text-2xs"),
      letterSpacing: mono ? token("tracking-normal") : token("tracking-wide"),
      paddingBlock: "0",
      paddingInline: token("space-1-5"),
      ...style,
    }}
    {...rest}
  >
    {children}
  </span>
);
