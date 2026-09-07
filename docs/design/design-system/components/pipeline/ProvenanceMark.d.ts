import * as React from 'react';

/** The per-field provenance mark required by the style card's `derived | edited` contract. */
export interface ProvenanceMarkProps extends React.HTMLAttributes<HTMLSpanElement> {
  origin?: 'measured' | 'derived' | 'edited';
  /** Citation for a derived field, e.g. `The Garden of Forking Paths`. Set in italic serif. */
  source?: string;
  /** Shown only when `origin="edited"` — resets the overlay field to the canonical value. */
  onReset?: () => void;
}
export declare function ProvenanceMark(props: ProvenanceMarkProps): JSX.Element;
