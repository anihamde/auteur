import * as React from 'react';

export interface WizardStep {
  id?: string;
  label: string;
  /** Right-aligned mono note, e.g. a count or duration. */
  note?: string;
}

/** The wizard's fixed left rail. Completed steps stay clickable — every step is re-enterable. */
export interface WizardRailProps extends React.HTMLAttributes<HTMLElement> {
  steps: WizardStep[];
  /** Zero-based index of the active step. */
  current?: number;
  /** Called with a step index. Omit to make the rail read-only. */
  onStep?: (index: number) => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}
export declare function WizardRail(props: WizardRailProps): JSX.Element;
