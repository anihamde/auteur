import {
  type ReactElement,
  type TextareaHTMLAttributes,
  useId,
  useState,
} from "react";
import { controlSurface, token } from "../styles.ts";

/** Multi-line control. `prose` switches to the serif face — the idea field. */
export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  readonly invalid?: boolean;
  readonly prose?: boolean;
  readonly resize?: "none" | "vertical" | "both";
  /** A live word count, announced politely rather than on every keystroke. */
  readonly counter?: boolean;
};

const countWords = (value: string): number =>
  value.trim() === "" ? 0 : value.trim().split(/\s+/).length;

export const Textarea = ({
  counter = false,
  defaultValue,
  invalid = false,
  onChange,
  prose = false,
  resize = "vertical",
  rows = 4,
  style,
  value,
  ...rest
}: TextareaProps): ReactElement => {
  const countId = useId();
  const [typed, setTyped] = useState(String(defaultValue ?? ""));
  const text = value === undefined ? typed : String(value);

  return (
    <div style={{ position: "relative" }}>
      <textarea
        aria-describedby={counter ? countId : undefined}
        aria-invalid={invalid ? true : undefined}
        rows={rows}
        style={{
          ...controlSurface,
          ...(invalid && { borderColor: token("oxblood-500") }),
          ...(prose && {
            fontFamily: token("font-prose"),
            fontSize: token("text-prose"),
            lineHeight: token("leading-prose"),
          }),
          padding: token("space-3"),
          resize,
          ...style,
        }}
        {...(value === undefined ? { defaultValue } : { value })}
        onChange={(event) => {
          if (value === undefined) setTyped(event.target.value);
          onChange?.(event);
        }}
        {...rest}
      />
      {counter ? (
        <span
          aria-live="polite"
          id={countId}
          style={{
            bottom: token("space-2"),
            color: token("text-muted"),
            fontFamily: token("font-data"),
            fontSize: token("text-2xs"),
            insetInlineEnd: token("space-3"),
            position: "absolute",
          }}
        >
          {countWords(text)} words
        </span>
      ) : undefined}
    </div>
  );
};
