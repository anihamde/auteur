import type { ReactElement, SelectHTMLAttributes } from "react";
import {
  CONTROL_HEIGHTS,
  type ControlSize,
  controlSurface,
  token,
} from "../styles.ts";

export type SelectOption =
  | string
  | { readonly value: string; readonly label: string };

/**
 * A native `<select>`.
 *
 * Native rather than a listbox built from divs: the platform's control is
 * keyboard-operable, screen-reader-announced and touch-friendly on every device
 * without any of it being reimplemented — and every one of those is a thing a
 * custom listbox gets wrong first.
 */
export type SelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> & {
  readonly options?: readonly SelectOption[];
  readonly size?: ControlSize;
  readonly invalid?: boolean;
};

const optionOf = (
  option: SelectOption,
): { readonly value: string; readonly label: string } =>
  typeof option === "string" ? { label: option, value: option } : option;

export const Select = ({
  children,
  invalid = false,
  options,
  size = "md",
  style,
  ...rest
}: SelectProps): ReactElement => (
  <select
    aria-invalid={invalid ? true : undefined}
    style={{
      ...controlSurface,
      ...(invalid && { borderColor: token("oxblood-500") }),
      appearance: "none",
      height: CONTROL_HEIGHTS[size],
      paddingBlock: "0",
      paddingInlineEnd: token("space-8"),
      paddingInlineStart: token("space-3"),
      ...style,
    }}
    {...rest}
  >
    {options === undefined
      ? children
      : options.map((option) => {
          const { label, value } = optionOf(option);
          return (
            <option key={value} value={value}>
              {label}
            </option>
          );
        })}
  </select>
);
