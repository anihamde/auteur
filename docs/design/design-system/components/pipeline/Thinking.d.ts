import * as React from 'react';

/**
 * A pipeline stage's live state — name, tier, elapsed time, and the detail lines
 * it streams. The research step (§6.3) is a stack of these.
 * @startingPoint section="Pipeline" subtitle="Stage progress, prosody stats, provenance" viewport="700x300"
 */
export interface ThinkingProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Stage id as the pipeline names it, e.g. `corpus-select`. Rendered mono. */
  stage: string;
  /** Model tier this stage resolved to. Colors the tier label. */
  tier?: 'cheap' | 'balanced' | 'strong';
  state?: 'pending' | 'running' | 'done' | 'failed';
  /** Streamed detail lines, oldest first. */
  detail?: string[];
  /** Preformatted elapsed string, e.g. `4.2s`. */
  elapsed?: string;
  open?: boolean;
  children?: React.ReactNode;
}
export declare function Thinking(props: ThinkingProps): JSX.Element;
