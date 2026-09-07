import React from 'react';
import { controlSurface } from './Input.jsx';

export function Textarea({ rows = 5, invalid = false, prose = false, resize = 'vertical', counter, value, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const css = {
    ...controlSurface,
    minHeight: rows * 22 + 18, padding: 'var(--space-3)', resize,
    lineHeight: prose ? 'var(--leading-prose)' : 'var(--leading-normal)',
    ...(prose ? { fontFamily: 'var(--font-serif)', fontSize: 'var(--text-md)' } : null),
    ...(invalid ? { borderColor: 'var(--border-danger)' } : null),
    ...(focus ? { borderColor: 'var(--border-focus)', boxShadow: '0 0 0 3px var(--accent-quiet)' } : null),
    ...style,
  };
  const area = <textarea rows={rows} value={value} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={css} {...rest} />;
  if (!counter) return area;
  const words = String(value || '').trim() ? String(value).trim().split(/\s+/).length : 0;
  return (
    <span style={{ display: 'block', position: 'relative' }}>
      {area}
      <span style={{ position: 'absolute', right: 'var(--space-3)', bottom: 'var(--space-2)', font: 'var(--type-data)', fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{words} words</span>
    </span>
  );
}
