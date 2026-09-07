import * as React from 'react';

/** Multi-line control. `prose` switches to the serif face — used for the step-1 idea field. */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  rows?: number;
  invalid?: boolean;
  /** Serif, prose line-height. For anything the user writes as writing. */
  prose?: boolean;
  resize?: 'none' | 'vertical' | 'both';
  /** Shows a live word count in the bottom-right. */
  counter?: boolean;
}
export declare function Textarea(props: TextareaProps): JSX.Element;
