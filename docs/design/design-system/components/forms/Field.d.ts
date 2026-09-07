import * as React from 'react';

/** Label + hint/error wrapper for one control. Carries the field's provenance mark. */
export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  /** Explanatory line under the control. Hidden when `error` is set. */
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** Style-card provenance shown beside the label. */
  provenance?: 'derived' | 'edited';
  htmlFor?: string;
  children?: React.ReactNode;
}
export declare function Field(props: FieldProps): JSX.Element;
