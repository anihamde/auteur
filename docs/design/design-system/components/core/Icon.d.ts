import * as React from 'react';

/** A Lucide glyph that inherits `currentColor`. The only icon primitive; never inline raw SVG. */
export interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Lucide icon name, kebab-case (e.g. `search`, `book-open`, `arrow-right`). */
  name: string;
  /** Edge length in px. 14 in dense chrome, 16 default, 20 in headers. */
  size?: number;
}
export declare function Icon(props: IconProps): JSX.Element;
