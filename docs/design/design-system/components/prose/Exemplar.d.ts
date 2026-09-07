import * as React from 'react';

/** A verbatim corpus passage with its citation. Selectable, never editable. */
export interface ExemplarProps extends React.HTMLAttributes<HTMLElement> {
  /** The passage, verbatim. Do not truncate mid-sentence or paraphrase. */
  text: React.ReactNode;
  /** Source work title. Required — an uncited passage is not an exemplar. */
  work: string;
  year?: string | number;
  /** What craft trait this passage demonstrates, e.g. "sentence-length floor". */
  demonstrates?: string;
  selected?: boolean;
  /** Present only when the user may include/exclude the passage. */
  onSelect?: () => void;
}
export declare function Exemplar(props: ExemplarProps): JSX.Element;
