One-sentence: one verbatim passage from the corpus, on paper, with its citation and the trait it demonstrates.

```jsx
<Exemplar
  work="In Our Time" year={1925} demonstrates="dialogue without tags"
  text="They went along the road together…"
  selected onSelect={() => toggle(id)} />
```

Notes
- `work` is required. The card's whole claim is that it is cited.
- Provide `onSelect` only where the user genuinely chooses which passages go in-context; the text itself is never editable.
- 8–15 exemplars per style card; render them as a single-column stack, not a grid.
