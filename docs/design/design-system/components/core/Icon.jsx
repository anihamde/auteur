import React from 'react';

/** Lucide glyph rendered as a CSS mask so it inherits `currentColor`. */
export function Icon({ name, size = 16, strokeWidth, style, ...rest }) {
  const url = `https://unpkg.com/lucide-static@0.454.0/icons/${name}.svg`;
  return (
    <span
      aria-hidden="true"
      data-icon={name}
      style={{
        display: 'inline-block', flex: '0 0 auto', width: size, height: size,
        background: 'currentColor',
        WebkitMask: `url("${url}") center / contain no-repeat`,
        mask: `url("${url}") center / contain no-repeat`,
        ...style,
      }}
      {...rest}
    />
  );
}
