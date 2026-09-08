import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { GROUNDS, token } from "../styles.ts";

/**
 * The subset of markdown auteur emits.
 *
 * A hand-written renderer over a closed subset rather than a markdown library:
 * the emitting end is this codebase's own prompts, the subset is six block
 * kinds, and a library would bring a parser for footnotes, tables, HTML
 * passthrough and autolinks — every one of which is a way for model output to
 * put markup on the page. Invariant 4 applies to what a model produces in
 * either direction.
 *
 * **Nothing here renders HTML from the source.** A `<` in the prose is a `<`.
 */

export type MarkdownProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  readonly children?: string;
  /** `paper` switches to ink-on-cream. Story prose is always paper. */
  readonly ground?: "ink" | "paper";
  readonly size?: "sm" | "md" | "lg";
  /** Appends a blinking caret to the final block while tokens arrive. */
  readonly streaming?: boolean;
};

export type Block =
  | { readonly kind: "heading"; readonly level: number; readonly text: string }
  | { readonly kind: "quote"; readonly text: string }
  | { readonly kind: "rule" }
  | { readonly kind: "list"; readonly items: readonly string[] }
  | { readonly kind: "paragraph"; readonly text: string };

/**
 * Split the source into blocks.
 *
 * Exported because it is the part with the behaviour: the renderer below is a
 * `switch` over what this returns, and a test that went through the DOM to
 * assert the parse would be testing React.
 */
export const parseBlocks = (source: string): Block[] =>
  source
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk): Block => {
      const heading = /^(#{1,4})\s+(.*)$/.exec(chunk);
      if (heading?.[1] !== undefined && heading[2] !== undefined) {
        return {
          kind: "heading",
          level: heading[1].length,
          text: heading[2],
        };
      }
      if (/^(-{3,}|\*{3,})$/.test(chunk)) return { kind: "rule" };
      if (chunk.startsWith("> ")) {
        return {
          kind: "quote",
          text: chunk
            .split("\n")
            .map((line) => line.replace(/^>\s?/, ""))
            .join(" "),
        };
      }
      if (/^[-*]\s+/.test(chunk)) {
        return {
          items: chunk
            .split("\n")
            .filter((line) => /^[-*]\s+/.test(line))
            .map((line) => line.replace(/^[-*]\s+/, "")),
          kind: "list",
        };
      }
      return { kind: "paragraph", text: chunk };
    });

/** Inline emphasis and code spans, as elements rather than as HTML. */
export const renderInline = (text: string): ReactNode[] =>
  text
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
    .filter((piece) => piece.length > 0)
    .map((piece, index) => {
      const key = `${index.toString()}-${piece.slice(0, 8)}`;
      if (piece.startsWith("**") && piece.endsWith("**")) {
        return <strong key={key}>{piece.slice(2, -2)}</strong>;
      }
      if (piece.startsWith("*") && piece.endsWith("*")) {
        return <em key={key}>{piece.slice(1, -1)}</em>;
      }
      if (piece.startsWith("`") && piece.endsWith("`")) {
        return <code key={key}>{piece.slice(1, -1)}</code>;
      }
      return <span key={key}>{piece}</span>;
    });

const SIZES = {
  lg: token("text-lg"),
  md: token("text-prose"),
  sm: token("text-base"),
} as const;

export const Markdown = ({
  children = "",
  ground = "paper",
  size = "md",
  streaming = false,
  style,
  ...rest
}: MarkdownProps): ReactElement => {
  const blocks = parseBlocks(children);
  return (
    <div
      data-ground={ground}
      style={{
        ...GROUNDS[ground],
        display: "flex",
        flexDirection: "column",
        fontFamily: token("font-prose"),
        fontSize: SIZES[size],
        gap: token("stack"),
        lineHeight: token("leading-prose"),
        maxWidth: token("measure-prose"),
        ...style,
      }}
      {...rest}
    >
      {blocks.map((block, index) => {
        const last = index === blocks.length - 1;
        const caret =
          streaming && last ? (
            <span aria-hidden="true" data-caret="true">
              ▍
            </span>
          ) : undefined;
        const key = `${block.kind}-${index.toString()}`;

        switch (block.kind) {
          case "heading": {
            const Tag = `h${Math.min(block.level, 4).toString()}` as
              | "h1"
              | "h2"
              | "h3"
              | "h4";
            return (
              <Tag key={key}>
                {renderInline(block.text)}
                {caret}
              </Tag>
            );
          }
          case "rule": {
            return <hr key={key} />;
          }
          case "quote": {
            return (
              <blockquote key={key}>
                {renderInline(block.text)}
                {caret}
              </blockquote>
            );
          }
          case "list": {
            return (
              <ul key={key}>
                {block.items.map((item, at) => (
                  <li key={`${item}-${at.toString()}`}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          }
          default: {
            return (
              <p key={key}>
                {renderInline(block.text)}
                {caret}
              </p>
            );
          }
        }
      })}
    </div>
  );
};
