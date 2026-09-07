import React from 'react';

/** A verbatim passage from the corpus. Never editable — an edited quote is not a citation. */
export function Exemplar({ text, work, year, demonstrates, selected, onSelect, style, ...rest }) {
  const [hot, setHot] = React.useState(false);
  return (
    <figure
      onClick={onSelect}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      style={{
        margin: 0, background: 'var(--surface-paper)', color: 'var(--text-paper)',
        borderRadius: 'var(--radius-paper)', padding: 'var(--space-5)',
        boxShadow: selected ? 'var(--shadow-paper), 0 0 0 2px var(--prussian-600)' : 'var(--shadow-paper)',
        cursor: onSelect ? 'pointer' : 'default',
        transform: hot && onSelect ? 'translateY(-1px)' : 'none',
        transition: 'transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
        display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', ...style,
      }}
      {...rest}
    >
      <blockquote style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'var(--text-md)', lineHeight: 'var(--leading-prose)', textWrap: 'pretty' }}>
        {text}
      </blockquote>
      <figcaption style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-4)', borderTop: '1px solid var(--border-paper)', paddingTop: 'var(--space-2)' }}>
        <cite style={{ font: 'var(--type-caption)', fontStyle: 'normal', color: 'var(--text-paper-muted)' }}>
          {work}{year ? <span style={{ color: 'var(--text-paper-faint)' }}>, {year}</span> : null}
        </cite>
        {demonstrates ? (
          <span style={{ font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--prussian-700)', textAlign: 'right' }}>{demonstrates}</span>
        ) : null}
      </figcaption>
    </figure>
  );
}
