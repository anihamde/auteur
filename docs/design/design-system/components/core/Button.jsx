import React from 'react';

const btnBase = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
  font: 'var(--type-label)', letterSpacing: 'var(--tracking-snug)', whiteSpace: 'nowrap',
  borderRadius: 'var(--radius-control)', border: '1px solid transparent',
  cursor: 'pointer', transition: 'var(--transition-control)', textDecoration: 'none',
  fontFamily: 'var(--font-sans)', appearance: 'none',
};

const btnSizes = {
  sm: { height: 'var(--control-height-sm)', padding: '0 var(--space-3)', fontSize: 'var(--text-xs)' },
  md: { height: 'var(--control-height)', padding: '0 var(--space-4)', fontSize: 'var(--text-sm)' },
  lg: { height: 'var(--control-height-lg)', padding: '0 var(--space-6)', fontSize: 'var(--text-base)' },
};

const btnVariants = {
  primary: { background: 'var(--accent)', color: 'var(--text-on-accent)', borderColor: 'var(--accent)' },
  secondary: { background: 'var(--surface-raised)', color: 'var(--text-body)', borderColor: 'var(--border-subtle)' },
  ghost: { background: 'transparent', color: 'var(--text-muted)', borderColor: 'transparent' },
  quiet: { background: 'var(--accent-quiet)', color: 'var(--text-accent)', borderColor: 'transparent' },
  danger: { background: 'transparent', color: 'var(--status-fail)', borderColor: 'var(--oxblood-600)' },
};

const btnHover = {
  primary: { background: 'var(--accent-hover)', borderColor: 'var(--accent-hover)' },
  secondary: { background: 'var(--surface-active)', borderColor: 'var(--border-strong)' },
  ghost: { background: 'var(--surface-hover)', color: 'var(--text-body)' },
  quiet: { background: 'var(--accent-quiet-hover)', color: 'var(--text-on-accent)' },
  danger: { background: 'var(--danger-quiet)', color: 'var(--status-fail)' },
};

export function Button({
  variant = 'secondary', size = 'md', disabled = false, loading = false,
  fullWidth = false, href, type = 'button', children, style, onClick, ...rest
}) {
  const [hot, setHot] = React.useState(false);
  const [down, setDown] = React.useState(false);
  const off = disabled || loading;
  const css = {
    ...btnBase, ...btnSizes[size] || btnSizes.md, ...btnVariants[variant] || btnVariants.secondary,
    ...(hot && !off ? btnHover[variant] || btnHover.secondary : null),
    ...(down && !off ? { transform: 'translateY(1px)' } : null),
    ...(off ? { opacity: 0.42, cursor: 'not-allowed' } : null),
    ...(fullWidth ? { width: '100%' } : null),
    ...style,
  };
  const handlers = {
    onMouseEnter: () => setHot(true), onMouseLeave: () => { setHot(false); setDown(false); },
    onMouseDown: () => setDown(true), onMouseUp: () => setDown(false),
  };
  const body = (
    <>
      {loading ? <span style={{ width: 11, height: 11, borderRadius: 'var(--radius-round)', border: '1.5px solid currentColor', borderTopColor: 'transparent', animation: 'auteur-spin 620ms linear infinite', opacity: 0.9 }} /> : null}
      {children}
    </>
  );
  if (href && !off) return <a href={href} style={css} {...handlers} {...rest}>{body}</a>;
  return <button type={type} disabled={off} onClick={onClick} style={css} {...handlers} {...rest}>{body}</button>;
}
