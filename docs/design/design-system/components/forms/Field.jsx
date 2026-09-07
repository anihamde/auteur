import React from 'react';

export function Field({ label, hint, error, required = false, provenance, htmlFor, children, style, ...rest }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)', ...style }} {...rest}>
      {label ? (
        <label htmlFor={htmlFor} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-1) var(--space-2)', font: 'var(--type-label)', lineHeight: 1.35, color: 'var(--text-body)' }}>
          <span>{label}{required ? <span style={{ color: 'var(--status-fail)', marginLeft: 2 }}>*</span> : null}</span>
          {provenance ? (
            <span style={{
              font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)',
              color: provenance === 'edited' ? 'var(--edited)' : 'var(--derived)',
            }}>{provenance}</span>
          ) : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <span style={{ font: 'var(--type-caption)', color: 'var(--status-fail)' }}>{error}</span>
      ) : hint ? (
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-faint)', maxWidth: 'var(--measure-ui)' }}>{hint}</span>
      ) : null}
    </div>
  );
}
