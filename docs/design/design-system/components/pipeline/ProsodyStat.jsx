import React from 'react';

/** One prosody measurement: label, mono value, and the corpus band the draft is scored against. */
export function ProsodyStat({ label, value, unit, band, target, status = 'neutral', style, ...rest }) {
  const tone = status === 'pass' ? 'var(--status-pass)' : status === 'drift' ? 'var(--status-drift)' : status === 'fail' ? 'var(--status-fail)' : 'var(--text-strong)';
  const pct = band && typeof value === 'number'
    ? Math.max(0, Math.min(100, ((value - band[0]) / (band[1] - band[0])) * 100))
    : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)', minWidth: 0, ...style }} {...rest}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <span style={{ font: 'var(--type-data)', color: tone, fontVariantNumeric: 'tabular-nums' }}>
          {value}{unit ? <span style={{ color: 'var(--text-faint)' }}>{unit}</span> : null}
        </span>
      </div>
      {band ? (
        <div style={{ position: 'relative', height: 4, background: 'var(--track)', borderRadius: 'var(--radius-round)' }}>
          <span style={{ position: 'absolute', inset: 0, left: '18%', right: '18%', background: 'var(--measured-tint)', borderRadius: 'var(--radius-round)' }} />
          {target != null && typeof target === 'number' ? (
            <span style={{ position: 'absolute', top: -2, bottom: -2, width: 1, left: `${Math.max(0, Math.min(100, ((target - band[0]) / (band[1] - band[0])) * 100))}%`, background: 'var(--border-strong)' }} />
          ) : null}
          {pct != null ? (
            <span style={{ position: 'absolute', top: -3, left: `${pct}%`, width: 2, height: 10, marginLeft: -1, background: tone, borderRadius: 1 }} />
          ) : null}
        </div>
      ) : null}
      {band ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--type-data)', fontSize: 'var(--text-3xs)', color: 'var(--text-faint)' }}>
          <span>{band[0]}</span><span>{band[1]}</span>
        </div>
      ) : null}
    </div>
  );
}
