import React from 'react';

const MODES = [
  { id: 'auto', icon: 'clock', label: 'Auto' },
  { id: 'light', icon: 'sun', label: 'Light' },
  { id: 'dark', icon: 'moon', label: 'Dark' },
];

function glyph(name, size) {
  const url = `https://unpkg.com/lucide-static@0.454.0/icons/${name}.svg`;
  return (
    <span aria-hidden="true" data-icon={name} style={{
      display: 'inline-block', flex: '0 0 auto', width: size, height: size, background: 'currentColor',
      WebkitMask: `url("${url}") center / contain no-repeat`, mask: `url("${url}") center / contain no-repeat`,
    }} />
  );
}

function byTime() { const h = new Date().getHours(); return h >= 6 && h < 18 ? 'light' : 'dark'; }

/** Auto / Light / Dark segmented control. Uncontrolled by default: reads and
 *  writes window.AuteurTheme (assets/theme.js) when present, and falls back to
 *  setting data-theme on <html> itself. */
export function ThemeToggle({ mode, onChange, size = 'md', showLabels = false, style, ...rest }) {
  const api = typeof window === 'undefined' ? null : window.AuteurTheme;
  const [local, setLocal] = React.useState(() => mode || (api ? api.get() : 'auto'));
  const active = mode || local;
  const controlled = mode != null;

  React.useEffect(() => {
    if (controlled) return undefined;
    const root = document.documentElement;
    const onExternal = (e) => setLocal(e.detail.mode);
    root.addEventListener('auteurthemechange', onExternal);
    return () => root.removeEventListener('auteurthemechange', onExternal);
  }, [controlled]);

  const pick = (id) => {
    if (!controlled) setLocal(id);
    if (api) api.set(id);
    else document.documentElement.dataset.theme = id === 'auto' ? byTime() : id;
    if (onChange) onChange(id);
  };

  const h = size === 'sm' ? 22 : 26;
  return (
    <div role="radiogroup" aria-label="Theme" style={{
      display: 'inline-flex', gap: 1, padding: 2, background: 'var(--surface-input)',
      border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-control)', ...style,
    }} {...rest}>
      {MODES.map((m) => {
        const on = m.id === active;
        return (
          <button
            key={m.id} type="button" role="radio" aria-checked={on} title={m.label} onClick={() => pick(m.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1-5)', height: h,
              padding: showLabels ? '0 var(--space-2)' : 0, width: showLabels ? 'auto' : h + 4,
              justifyContent: 'center', cursor: 'pointer', appearance: 'none',
              border: '1px solid transparent', borderRadius: 'var(--radius-xs)',
              background: on ? 'var(--surface-active)' : 'transparent',
              color: on ? 'var(--text-strong)' : 'var(--text-faint)',
              font: 'var(--type-label)', letterSpacing: 'var(--tracking-normal)',
              transition: 'var(--transition-control)',
            }}
          >
            {glyph(m.icon, size === 'sm' ? 12 : 14)}
            {showLabels ? m.label : null}
          </button>
        );
      })}
    </div>
  );
}
