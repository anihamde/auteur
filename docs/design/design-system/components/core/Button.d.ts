import * as React from 'react';

/**
 * The primary action control. Five variants; `primary` is reserved for the one
 * forward action on a wizard step.
 * @startingPoint section="Core" subtitle="Buttons, sizes and states" viewport="700x150"
 */
export interface ButtonProps extends React.HTMLAttributes<HTMLElement> {
  /** Visual weight. `primary` = the step's forward action; `quiet` = suggested answers. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  /** Shows an inline spinner and blocks interaction. */
  loading?: boolean;
  fullWidth?: boolean;
  /** Renders an `<a>` instead of a `<button>`. */
  href?: string;
  type?: 'button' | 'submit' | 'reset';
  children?: React.ReactNode;
}
export declare function Button(props: ButtonProps): JSX.Element;
