import * as React from 'react';

/** Native select with a masked Lucide caret. Options are enums from the style-card schema. */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: Array<string | { value: string; label: string }>;
  size?: 'sm' | 'md' | 'lg';
  invalid?: boolean;
}
export declare function Select(props: SelectProps): JSX.Element;
