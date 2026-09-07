import * as React from 'react';

/**
 * Renders the subset of markdown auteur emits: headings, paragraphs, em/strong,
 * blockquote, rules, lists, code spans. Story prose uses `ground="paper"`.
 * @startingPoint section="Prose" subtitle="Story prose and verbatim exemplars" viewport="700x360"
 */
export interface MarkdownProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The markdown source. */
  children?: string;
  /** `paper` switches to ink-on-cream and indents continuation paragraphs. */
  ground?: 'ink' | 'paper';
  size?: 'sm' | 'md' | 'lg';
  /** Appends a blinking caret to the final block while tokens are still arriving. */
  streaming?: boolean;
}
export declare function Markdown(props: MarkdownProps): JSX.Element;
