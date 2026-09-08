import type { InputHTMLAttributes, ReactElement, ReactNode } from "react";
import {
  CONTROL_HEIGHTS,
  type ControlSize,
  controlSurface,
  token,
} from "../styles.ts";

/** Single-line text control. Author search-as-you-type, and short constraints. */
export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  readonly size?: ControlSize;
  readonly invalid?: boolean;
  /** Mono face, for numbers, targets and schema paths. */
  readonly mono?: boolean;
  /** Leading glyph. Reserves left padding rather than overlapping the text. */
  readonly icon?: ReactNode;
};

export const Input = ({
  icon,
  invalid = false,
  mono = false,
  size = "md",
  style,
  ...rest
}: InputProps): ReactElement => {
  const field = (
    <input
      aria-invalid={invalid ? true : undefined}
      style={{
        ...controlSurface,
        ...(mono && { fontFamily: token("font-data") }),
        ...(invalid && { borderColor: token("oxblood-500") }),
        height: CONTROL_HEIGHTS[size],
        paddingBlock: "0",
        paddingInline: token("space-3"),
        // Longhand and logical: a `padding` shorthand containing `var()`
        // cannot be parsed by the CSSOM and is dropped, taking the reserved
        // space with it.
        ...(icon !== undefined && { paddingInlineStart: token("space-8") }),
        ...style,
      }}
      {...rest}
    />
  );

  if (icon === undefined) return field;
  return (
    <span
      style={{ display: "inline-block", position: "relative", width: "100%" }}
    >
      <span
        style={{
          alignItems: "center",
          bottom: "0",
          color: token("text-muted"),
          display: "flex",
          insetInlineStart: token("space-3"),
          pointerEvents: "none",
          position: "absolute",
          top: "0",
        }}
      >
        {icon}
      </span>
      {field}
    </span>
  );
};
