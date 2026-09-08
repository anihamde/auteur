import {
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  useId,
} from "react";
import { ProvenanceMark } from "../pipeline/provenance-mark.tsx";
import { token } from "../styles.ts";

/**
 * Label, hint or error, and the field's provenance mark.
 *
 * The hint is **hidden when there is an error**, not stacked below it: two
 * lines of guidance where one contradicts the other is how a reader ends up
 * reading the wrong one.
 */
export type FieldProps = HTMLAttributes<HTMLDivElement> & {
  readonly label?: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly required?: boolean;
  readonly provenance?: "derived" | "edited";
  readonly htmlFor?: string;
  readonly children?: ReactNode;
};

export const Field = ({
  children,
  error,
  hint,
  htmlFor,
  label,
  provenance,
  required = false,
  style,
  ...rest
}: FieldProps): ReactElement => {
  const generated = useId();
  const controlId = htmlFor ?? generated;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: token("stack-tight"),
        ...style,
      }}
      {...rest}
    >
      {label === undefined ? undefined : (
        <label
          htmlFor={controlId}
          style={{
            alignItems: "center",
            color: token("text-body"),
            display: "flex",
            fontFamily: token("font-ui"),
            fontSize: token("text-sm"),
            gap: token("inline-tight"),
          }}
        >
          {label}
          {required ? (
            <span aria-hidden="true" style={{ color: token("text-muted") }}>
              *
            </span>
          ) : undefined}
          {provenance === undefined ? undefined : (
            <ProvenanceMark origin={provenance} />
          )}
        </label>
      )}
      {children}
      {error === undefined ? (
        hint === undefined ? undefined : (
          <p style={{ color: token("text-muted"), fontSize: token("text-xs") }}>
            {hint}
          </p>
        )
      ) : (
        <p
          role="alert"
          style={{ color: token("oxblood-400"), fontSize: token("text-xs") }}
        >
          {error}
        </p>
      )}
    </div>
  );
};
