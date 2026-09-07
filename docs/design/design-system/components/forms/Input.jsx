import React from 'react';

export const controlSurface = {
  width: '100%', background: 'var(--surface-input)', color: 'var(--text-strong)',
  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-control)',
  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
  transition: 'var(--transition-control)', outline: 'none', appearance: 'none',
};

export function Input({ size = 'md', invalid = false, mono = false, icon, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const heights = { sm: 'var(--control-height-sm)', md: 'var(--control-height)', lg: 'var(--control-height-lg)' };
  const css = {
    ...controlSurface,
    height: heights[size] || heights.md,
    padding: icon ? '0 var(--space-3) 0 var(--space-8)' : '0 var(--space-3)',
    fontSize: size === 'lg' ? 'var(--text-md)' : 'var(--text-base)',
    ...(mono ? { fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' } : null),
    ...(invalid ? { borderColor: 'var(--border-danger)' } : null),
    ...(focus ? { borderColor: 'var(--border-focus)', boxShadow: '0 0 0 3px var(--accent-quiet)' } : null),
    ...style,
  };
  const field = <input onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={css} {...rest} />;
  if (!icon) return field;
  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <span style={{ position: 'absolute', left: 'var(--space-3)', top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: focus ? 'var(--text-accent)' : 'var(--text-faint)', pointerEvents: 'none', transition: 'var(--transition-control)' }}>{icon}</span>
      {field}
    </span>
  );
}
