import React from 'react';

const cardGrounds = {
  ink: { background: 'var(--surface-card)', color: 'var(--text-body)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-card)' },
  panel: { background: 'var(--surface-panel)', color: 'var(--text-body)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-panel)', boxShadow: 'none' },
  paper: { background: 'var(--surface-paper)', color: 'var(--text-paper)', border: 'none', borderRadius: 'var(--radius-paper)', boxShadow: 'var(--shadow-paper)' },
  outline: { background: 'transparent', color: 'var(--text-body)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)', boxShadow: 'none' },
};

const cardPads = { none: 0, sm: 'var(--gutter-card-tight)', md: 'var(--gutter-card)', lg: 'var(--gutter-panel)' };

export function Card({ ground = 'ink', padding = 'md', interactive = false, selected = false, accent, children, style, ...rest }) {
  const [hot, setHot] = React.useState(false);
  const css = {
    ...cardGrounds[ground] || cardGrounds.ink,
    padding: cardPads[padding] ?? cardPads.md,
    transition: 'var(--transition-control)',
    ...(accent ? { borderTop: `var(--rule-accent) solid ${accent}` } : null),
    ...(interactive ? { cursor: 'pointer' } : null),
    ...(interactive && hot ? { background: ground === 'paper' ? 'var(--surface-paper-sunk)' : 'var(--surface-raised)', borderColor: 'var(--border-subtle)' } : null),
    ...(selected ? { borderColor: 'var(--border-accent)', background: ground === 'paper' ? 'var(--surface-paper)' : 'var(--surface-selected)' } : null),
    ...style,
  };
  return (
    <div
      style={css}
      onMouseEnter={interactive ? () => setHot(true) : undefined}
      onMouseLeave={interactive ? () => setHot(false) : undefined}
      {...rest}
    >{children}</div>
  );
}

export function CardHeader({ title, meta, action, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-4)', marginBottom: 'var(--space-3)', ...style }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
        <span style={{ font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-faint)' }}>{meta}</span>
        <span style={{ font: 'var(--type-heading)', color: 'var(--text-strong)' }}>{title}</span>
      </div>
      {action}
    </div>
  );
}
