import React from 'react';

/* A deliberately small markdown renderer — headings, paragraphs, em/strong,
   blockquote, hr, lists, code spans. Enough for story prose, outlines and
   critique findings; not a general-purpose parser. */
function inline(src) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={m.index} style={{ fontWeight: 600 }}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={m.index} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88em', background: 'var(--surface-raised)', padding: '1px 4px', borderRadius: 'var(--radius-xs)' }}>{t.slice(1, -1)}</code>);
    else out.push(<em key={m.index} style={{ fontStyle: 'italic' }}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

export function Markdown({ children = '', ground = 'ink', size = 'md', streaming = false, style, ...rest }) {
  const paper = ground === 'paper';
  const blocks = String(children).replace(/\r/g, '').split(/\n{2,}/).filter((b) => b.trim());
  const body = paper ? 'var(--text-paper)' : 'var(--text-body)';
  const muted = paper ? 'var(--text-paper-muted)' : 'var(--text-muted)';
  const fs = size === 'sm' ? 'var(--text-base)' : size === 'lg' ? 'var(--text-lg)' : 'var(--text-md)';
  return (
    <div style={{ fontFamily: 'var(--font-serif)', fontSize: fs, lineHeight: 'var(--leading-prose)', color: body, maxWidth: 'var(--measure-prose)', display: 'flex', flexDirection: 'column', gap: '1em', ...style }} {...rest}>
      {blocks.map((b, i) => {
        const t = b.trim();
        const last = i === blocks.length - 1;
        const caret = streaming && last ? <span style={{ display: 'inline-block', width: '0.42em', height: '1em', marginLeft: '0.1em', background: 'var(--accent)', verticalAlign: '-0.14em', animation: 'auteur-caret 1s steps(1) infinite' }} /> : null;
        if (t === '---' || t === '***') return <hr key={i} style={{ border: 'none', borderTop: '1px solid ' + (paper ? 'var(--border-paper)' : 'var(--border-subtle)'), width: '4em', margin: '0.6em auto' }} />;
        if (t.startsWith('### ')) return <h3 key={i} style={{ font: 'var(--type-heading)', fontFamily: 'var(--font-sans)', color: body, textTransform: 'none', marginTop: '0.4em' }}>{inline(t.slice(4))}</h3>;
        if (t.startsWith('## ')) return <h2 key={i} style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', fontWeight: 400, lineHeight: 'var(--leading-snug)', color: body, marginTop: '0.3em' }}>{inline(t.slice(3))}</h2>;
        if (t.startsWith('# ')) return <h1 key={i} style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-2xl)', fontWeight: 400, lineHeight: 'var(--leading-snug)', color: body }}>{inline(t.slice(2))}</h1>;
        if (t.startsWith('> ')) return <blockquote key={i} style={{ margin: 0, paddingLeft: '1em', borderLeft: '2px solid ' + (paper ? 'var(--border-paper)' : 'var(--border-strong)'), color: muted, fontStyle: 'italic' }}>{inline(t.replace(/^> ?/gm, ''))}</blockquote>;
        if (/^(\d+\.|[-*]) /.test(t)) {
          const ordered = /^\d+\./.test(t);
          const items = t.split('\n').map((l) => l.replace(/^(\d+\.|[-*]) ?/, ''));
          const List = ordered ? 'ol' : 'ul';
          return <List key={i} style={{ margin: 0, paddingLeft: '1.4em', display: 'flex', flexDirection: 'column', gap: '0.35em' }}>{items.map((it, j) => <li key={j}>{inline(it)}</li>)}</List>;
        }
        return <p key={i} style={{ margin: 0, textIndent: paper && i > 0 ? '1.4em' : 0, textWrap: 'pretty' }}>{inline(t)}{caret}</p>;
      })}
    </div>
  );
}
