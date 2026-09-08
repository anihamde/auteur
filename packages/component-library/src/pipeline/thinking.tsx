import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { Badge } from "../core/badge.tsx";
import { token } from "../styles.ts";

/**
 * A stage's live state — name, tier, elapsed, and the lines it streams.
 *
 * The detail lines are **rendered, never composed**: they arrive as
 * `stage_detail` events and this component prints them. A component that built
 * a sentence from a stage's numbers would be a second place the pipeline's
 * story is told, and the two would disagree.
 */
export type ThinkingState = "pending" | "running" | "done" | "failed";

export type ThinkingProps = HTMLAttributes<HTMLDivElement> & {
  /** Stage id as the pipeline names it. Rendered mono. */
  readonly stage: string;
  readonly tier?: "cheap" | "balanced" | "strong";
  readonly state?: ThinkingState;
  /** Streamed detail lines, oldest first. */
  readonly detail?: readonly string[];
  /** Preformatted elapsed string. Never computed here. */
  readonly elapsed?: string;
  readonly open?: boolean;
  readonly children?: ReactNode;
};

const STATE_COLOURS = {
  done: token("laurel-400"),
  failed: token("oxblood-400"),
  pending: token("text-muted"),
  running: token("prussian-300"),
} as const;

export const Thinking = ({
  children,
  detail = [],
  elapsed,
  open = true,
  stage,
  state = "pending",
  style,
  tier,
  ...rest
}: ThinkingProps): ReactElement => (
  <div
    data-state={state}
    style={{
      display: "flex",
      flexDirection: "column",
      gap: token("stack-tight"),
      ...style,
    }}
    {...rest}
  >
    <div
      style={{
        alignItems: "center",
        display: "flex",
        gap: token("inline"),
      }}
    >
      <span
        aria-hidden="true"
        data-dot="true"
        style={{
          background: STATE_COLOURS[state],
          borderRadius: token("radius-round"),
          height: token("space-1-5"),
          width: token("space-1-5"),
        }}
      />
      <span
        style={{
          color: token("text-body"),
          fontFamily: token("font-data"),
          fontSize: token("text-xs"),
        }}
      >
        {stage}
      </span>
      {/* A stage with no tier runs no model. The badge is absent rather than
          empty, which is what gives `prosody-compute` its null tier badge. */}
      {tier === undefined ? undefined : <Badge tone={tier}>{tier}</Badge>}
      {elapsed === undefined ? undefined : (
        <span
          style={{
            color: token("text-muted"),
            fontFamily: token("font-data"),
            fontSize: token("text-2xs"),
            marginInlineStart: "auto",
          }}
        >
          {elapsed}
        </span>
      )}
    </div>
    {open && detail.length > 0 ? (
      <ul
        style={{
          color: token("text-muted"),
          fontSize: token("text-xs"),
          listStyle: "none",
          margin: token("space-0"),
          paddingInlineStart: token("space-5"),
        }}
      >
        {detail.map((line, index) => (
          <li key={`${line}-${index.toString()}`}>{line}</li>
        ))}
      </ul>
    ) : undefined}
    {children}
  </div>
);
