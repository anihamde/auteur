import type { HTMLAttributes, ReactElement } from "react";
import { token } from "../styles.ts";

/**
 * The per-field provenance mark. Invariant 2, rendered.
 *
 * `edited` is amber and carries a reset, because an edited field is the one
 * state the product cannot vouch for: everything else on the card was read from
 * a passage or counted from the corpus. Making the reset part of the mark means
 * the way back is wherever the warning is.
 */
export type ProvenanceMarkProps = HTMLAttributes<HTMLSpanElement> & {
  readonly origin?: "measured" | "derived" | "edited";
  /** The cited work, for a derived field. Set in italic serif. */
  readonly source?: string;
  /** Shown only for `edited`. Resets the overlay field to the canonical value. */
  readonly onReset?: () => void;
};

const COLOURS = {
  derived: token("text-muted"),
  edited: token("amber-400"),
  measured: token("laurel-400"),
} as const;

const LABELS = {
  derived: "read from a passage",
  edited: "edited — not measured",
  measured: "measured",
} as const;

export const ProvenanceMark = ({
  onReset,
  origin = "derived",
  source,
  style,
  ...rest
}: ProvenanceMarkProps): ReactElement => (
  <span
    data-origin={origin}
    style={{
      alignItems: "baseline",
      color: COLOURS[origin],
      display: "inline-flex",
      fontFamily: token("font-ui"),
      fontSize: token("text-2xs"),
      gap: token("inline-tight"),
      ...style,
    }}
    {...rest}
  >
    <span>{LABELS[origin]}</span>
    {source === undefined ? undefined : (
      <cite style={{ fontFamily: token("font-prose"), fontStyle: "italic" }}>
        {source}
      </cite>
    )}
    {origin === "edited" && onReset !== undefined ? (
      <button
        onClick={onReset}
        style={{
          background: "none",
          borderStyle: "none",
          color: "inherit",
          cursor: "pointer",
          font: "inherit",
          padding: token("space-0"),
          textDecoration: "underline",
        }}
        type="button"
      >
        reset
      </button>
    ) : undefined}
  </span>
);
