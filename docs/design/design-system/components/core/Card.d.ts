import * as React from 'react';

/**
 * A surface. `ground="paper"` is reserved for story prose and verbatim
 * exemplars — the artifact; everything else is instrument chrome.
 * @startingPoint section="Core" subtitle="Ink, panel, outline and paper cards" viewport="700x260"
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  ground?: 'ink' | 'panel' | 'paper' | 'outline';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Adds hover feedback and a pointer cursor. */
  interactive?: boolean;
  selected?: boolean;
  /** A CSS color for a 3px top rule — use provenance/status tokens only. */
  accent?: string;
  children?: React.ReactNode;
}
export declare function Card(props: CardProps): JSX.Element;

export interface CardHeaderProps {
  title?: React.ReactNode;
  /** Uppercase eyebrow above the title. */
  meta?: React.ReactNode;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function CardHeader(props: CardHeaderProps): JSX.Element;
