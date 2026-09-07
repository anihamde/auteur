One-sentence: the only icon primitive — a Lucide glyph masked to `currentColor`; use it instead of inline SVG, emoji, or unicode symbols.

```jsx
<Icon name="search" size={16} />
<span style={{ color: 'var(--status-pass)' }}><Icon name="check" size={14} /></span>
```

Notes
- Names are Lucide kebab-case, loaded per-icon from the `lucide-static` CDN.
- Color comes from the parent's `color`; never pass a fill.
- Sizes: 14 dense chrome, 16 default, 20 section headers. Nothing larger — auteur has no illustrative iconography.
