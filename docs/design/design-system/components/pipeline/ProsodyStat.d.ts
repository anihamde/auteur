import * as React from 'react';

/** One deterministic prosody measurement, optionally plotted against the corpus band. */
export interface ProsodyStatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: number | string;
  /** Unit suffix, e.g. ` words` or `/1k`. */
  unit?: string;
  /** `[min, max]` axis for the plotted band. Omit for a bare label/value row. */
  band?: [number, number];
  /** The `prosodyTarget` tick — drawn as a hairline, distinct from the value marker. */
  target?: number;
  /** Style-fit verdict for this measure. */
  status?: 'neutral' | 'pass' | 'drift' | 'fail';
}
export declare function ProsodyStat(props: ProsodyStatProps): JSX.Element;
