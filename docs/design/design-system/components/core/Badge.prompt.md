One-sentence: a small classification label, used for model tiers, corpus provenance tiers, and field provenance.

```jsx
<Badge tone="strong">strong</Badge>
<Badge tone="measured">full-text</Badge>
<Badge tone="edited">edited</Badge>
<Badge tone="neutral" mono>v3</Badge>
```

Notes
- Tone maps to meaning: `cheap|balanced|strong` = pipeline tier; `measured` = computed from corpus; `edited` = user-overridden and therefore uncited; `fail` = style-fit miss.
- `mono` drops the uppercase tracking — use for versions, counts, schema paths.
