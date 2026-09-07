import React from 'react';

const stateFace = {
  pending: { dot: 'var(--dot-pending)', label: 'var(--text-faint)' },
  running: { dot: 'var(--status-running)', label: 'var(--text-body)' },
  done: { dot: 'var(--status-pass)', label: 'var(--text-muted)' },
  failed: { dot: 'var(--status-fail)', label: 'var(--status-fail)' },
};

/** A pipeline stage in progress: stage name, tier, elapsed, and streamed detail lines. */
export function Thinking({ stage, tier, state = 'running', detail = [], elapsed, open = true, children, style, ...rest }) {
  const face = stateFace[state] || stateFace.running;
  return (
    <div style={{ background: 'var(--surface-panel)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-card)', padding: 'var(--space-3) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', ...style }} {...rest}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-round)', background: face.dot, flex: '0 0 auto', animation: state === 'running' ? 'auteur-pulse 1.3s var(--ease-in-out) infinite' : 'none' }} />
        <span style={{ font: 'var(--type-data)', color: face.label, letterSpacing: 'var(--tracking-normal)' }}>{stage}</span>
        {tier ? <span style={{ font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: `var(--tier-${tier})` }}>{tier}</span> : null}
        <span style={{ flex: 1 }} />
        {elapsed ? <span style={{ font: 'var(--type-data)', fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{elapsed}</span> : null}
      </div>
      {open && (detail.length || children) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', paddingLeft: 'var(--space-4)', borderLeft: '1px solid var(--border-hairline)', marginLeft: 2 }}>
          {detail.map((d, i) => (
            <span key={i} style={{ font: 'var(--type-data)', fontSize: 'var(--text-xs)', color: i === detail.length - 1 && state === 'running' ? 'var(--text-muted)' : 'var(--text-faint)', animation: 'auteur-fade-up var(--dur-base) var(--ease-out)' }}>{d}</span>
          ))}
          {children}
        </div>
      ) : null}
    </div>
  );
}
