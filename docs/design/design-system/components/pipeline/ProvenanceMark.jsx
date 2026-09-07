import React from 'react';

/** Marks whether a style-card field is evidence-derived, measured, or user-edited. */
export function ProvenanceMark({ origin = 'derived', source, onReset, style, ...rest }) {
  const face = {
    measured: { color: 'var(--measured)', text: 'measured' },
    derived: { color: 'var(--derived)', text: 'derived' },
    edited: { color: 'var(--edited)', text: 'edited' },
  }[origin] || { color: 'var(--derived)', text: origin };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1-5)', font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: face.color, ...style }} {...rest}>
      <span style={{ width: 5, height: 5, background: face.color, transform: 'rotate(45deg)', flex: '0 0 auto' }} />
      {face.text}
      {source ? <span style={{ textTransform: 'none', letterSpacing: 'var(--tracking-normal)', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 'var(--text-xs)', fontWeight: 400, color: 'var(--text-faint)' }}>{source}</span> : null}
      {origin === 'edited' && onReset ? (
        <button onClick={onReset} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--text-faint)', textDecoration: 'underline', cursor: 'pointer' }}>reset</button>
      ) : null}
    </span>
  );
}
