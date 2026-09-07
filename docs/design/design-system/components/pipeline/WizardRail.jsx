import React from 'react';
import { Icon } from '../core/Icon.jsx';

/** The wizard's seven steps as a fixed left rail. Completed steps are re-enterable. */
export function WizardRail({ steps = [], current = 0, onStep, header, footer, style, ...rest }) {
  return (
    <nav style={{ width: 'var(--rail-width)', flex: '0 0 auto', background: 'var(--surface-panel)', borderRight: '1px solid var(--border-hairline)', padding: 'var(--space-5) 0', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', ...style }} {...rest}>
      {header ? <div style={{ padding: '0 var(--space-5)' }}>{header}</div> : null}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {steps.map((s, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'pending';
          const enterable = state !== 'pending' && !!onStep;
          return (
            <li key={s.id || i}>
              <button
                onClick={enterable ? () => onStep(i) : undefined}
                disabled={!enterable}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-2) var(--space-5)', background: state === 'current' ? 'var(--surface-selected)' : 'transparent',
                  border: 'none', borderLeft: `var(--rule-medium) solid ${state === 'current' ? 'var(--accent)' : 'transparent'}`,
                  textAlign: 'left', cursor: enterable ? 'pointer' : 'default', transition: 'var(--transition-control)',
                  color: state === 'current' ? 'var(--text-strong)' : state === 'done' ? 'var(--text-muted)' : 'var(--text-faint)',
                }}
              >
                <span style={{ font: 'var(--type-data)', fontSize: 'var(--text-2xs)', color: state === 'done' ? 'var(--status-pass)' : 'inherit', width: 12, flex: '0 0 auto' }}>
                  {state === 'done' ? <Icon name="check" size={11} /> : i + 1}
                </span>
                <span style={{ font: 'var(--type-label)', fontWeight: state === 'current' ? 600 : 400, flex: 1, minWidth: 0 }}>{s.label}</span>
                {s.note ? <span style={{ font: 'var(--type-data)', fontSize: 'var(--text-3xs)', color: 'var(--text-faint)' }}>{s.note}</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
      <span style={{ flex: 1 }} />
      {footer ? <div style={{ padding: '0 var(--space-5)' }}>{footer}</div> : null}
    </nav>
  );
}
