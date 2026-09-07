import * as React from 'react';

/** A small status or classification label. Tones carry meaning — pick by meaning, not color. */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** `cheap|balanced|strong` are model tiers; `measured|edited` are provenance. */
  tone?: 'neutral' | 'accent' | 'measured' | 'edited' | 'fail' | 'cheap' | 'balanced' | 'strong';
  /** Mono, sentence-case, untracked — for numbers, IDs and schema paths. */
  mono?: boolean;
  children?: React.ReactNode;
}
export declare function Badge(props: BadgeProps): JSX.Element;
