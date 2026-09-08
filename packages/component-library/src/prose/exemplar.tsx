import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { GROUNDS, token } from "../styles.ts";

/**
 * A verbatim corpus passage with its citation.
 *
 * **There is no code path that mutates `text`.** No truncation, no ellipsis, no
 * paraphrase, no `maxLength`: an exemplar is evidence, and evidence that has
 * been shortened to fit is no longer the thing that was cited. The prop goes to
 * the DOM byte for byte, and a test asserts it.
 *
 * `work` is required for the same reason — an uncited passage is not an
 * exemplar, and making the citation optional would let one exist.
 */
export type ExemplarProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  readonly text: string;
  readonly work: string;
  readonly year?: string | number;
  readonly demonstrates?: string;
  readonly selected?: boolean;
  /** Present only when the reader may include or exclude the passage. */
  readonly onSelect?: () => void;
};

export const Exemplar = ({
  demonstrates,
  onSelect,
  selected = false,
  style,
  text,
  work,
  year,
  ...rest
}: ExemplarProps): ReactElement => (
  <figure
    data-selected={selected ? "true" : undefined}
    style={{
      ...GROUNDS.paper,
      borderRadius: token("radius-paper"),
      margin: token("space-0"),
      padding: token("gutter-card"),
      ...(selected && {
        outlineColor: token("prussian-600"),
        outlineStyle: "solid",
        outlineWidth: token("rule-hairline"),
      }),
      ...style,
    }}
    {...rest}
  >
    <blockquote
      style={{
        fontFamily: token("font-prose"),
        fontSize: token("text-prose"),
        lineHeight: token("leading-prose"),
        margin: token("space-0"),
      }}
    >
      {text}
    </blockquote>
    <figcaption
      style={{
        color: token("text-paper-muted"),
        display: "flex",
        fontFamily: token("font-ui"),
        fontSize: token("text-2xs"),
        gap: token("inline"),
        marginBlockStart: token("stack-tight"),
      }}
    >
      <cite style={{ fontFamily: token("font-prose"), fontStyle: "italic" }}>
        {work}
      </cite>
      {year === undefined ? undefined : <span>{year}</span>}
      {demonstrates === undefined ? undefined : <span>{demonstrates}</span>}
      {onSelect === undefined ? undefined : (
        <button
          onClick={onSelect}
          style={{
            background: "none",
            borderStyle: "none",
            color: "inherit",
            cursor: "pointer",
            font: "inherit",
            marginInlineStart: "auto",
            padding: token("space-0"),
            textDecoration: "underline",
          }}
          type="button"
        >
          {selected ? "exclude" : "include"}
        </button>
      )}
    </figcaption>
  </figure>
);

/** Deliberately absent: nothing exported from this module edits an exemplar. */
export type { ReactNode as ExemplarChildren };
