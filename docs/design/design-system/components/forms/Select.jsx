import React from 'react';
import { controlSurface } from './Input.jsx';

export function Select({ options = [], size = 'md', invalid = false, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const heights = { sm: 'var(--control-height-sm)', md: 'var(--control-height)', lg: 'var(--control-height-lg)' };
  const caret = 'https://unpkg.com/lucide-static@0.454.0/icons/chevron-down.svg';
  const css = {
    ...controlSurface,
    height: heights[size] || heights.md,
    padding: '0 var(--space-8) 0 var(--space-3)',
    ...(invalid ? { borderColor: 'var(--border-danger)' } : null),
    ...(focus ? { borderColor: 'var(--border-focus)', boxShadow: '0 0 0 3px var(--accent-quiet)' } : null),
    ...style,
  };
  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <select onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={css} {...rest}>
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o;
          return <option key={opt.value} value={opt.value}>{opt.label}</option>;
        })}
      </select>
      <span aria-hidden="true" style={{ position: 'absolute', right: 'var(--space-3)', top: '50%', marginTop: -7, width: 14, height: 14, background: 'var(--text-faint)', WebkitMask: `url("${caret}") center / contain no-repeat`, mask: `url("${caret}") center / contain no-repeat`, pointerEvents: 'none' }} />
    </span>
  );
}
