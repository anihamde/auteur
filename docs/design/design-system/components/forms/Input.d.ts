import * as React from 'react';

/**
 * Single-line text control. Used for author search-as-you-type and short constraints.
 * @startingPoint section="Forms" subtitle="Inputs, selects and textareas" viewport="700x300"
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  size?: 'sm' | 'md' | 'lg';
  invalid?: boolean;
  /** Mono face — for numbers, targets and schema paths. */
  mono?: boolean;
  /** Leading glyph, e.g. `<Icon name="search" />`. Reserves left padding. */
  icon?: React.ReactNode;
}
export declare function Input(props: InputProps): JSX.Element;

/** Shared control surface style object; reused by Select and Textarea. */
export declare const controlSurface: React.CSSProperties;
