import React from 'react';

const badgeTones = {
  neutral: { color: 'var(--text-muted)', background: 'var(--surface-raised)', border: '1px solid var(--border-hairline)' },
  accent: { color: 'var(--text-accent)', background: 'var(--derived-tint)', border: '1px solid transparent' },
  measured: { color: 'var(--measured)', background: 'var(--measured-tint)', border: '1px solid transparent' },
  edited: { color: 'var(--edited)', background: 'var(--edited-tint)', border: '1px solid transparent' },
  fail: { color: 'var(--status-fail)', background: 'var(--danger-quiet)', border: '1px solid transparent' },
  cheap: { color: 'var(--tier-cheap)', background: 'var(--surface-raised)', border: '1px solid var(--border-hairline)' },
  balanced: { color: 'var(--tier-balanced)', background: 'var(--derived-tint)', border: '1px solid transparent' },
  strong: { color: 'var(--tier-strong)', background: 'var(--edited-tint)', border: '1px solid transparent' },
};

export function Badge({ tone = 'neutral', mono = false, children, style, ...rest }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
        height: 18, padding: '0 var(--space-1-5)', borderRadius: 'var(--radius-xs)',
        whiteSpace: 'nowrap', flex: '0 0 auto',
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        fontSize: 'var(--text-2xs)', fontWeight: mono ? 400 : 600,
        letterSpacing: mono ? 'var(--tracking-normal)' : 'var(--tracking-caps)',
        textTransform: mono ? 'none' : 'uppercase',
        ...badgeTones[tone] || badgeTones.neutral, ...style,
      }}
      {...rest}
    >{children}</span>
  );
}
