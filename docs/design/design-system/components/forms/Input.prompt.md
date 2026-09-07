One-sentence: single-line text entry; `size="lg"` + `icon` is the author search-as-you-type pattern.

```jsx
<Input size="lg" icon={<Icon name="search" />} placeholder="Search authors in the corpus…" />
<Input mono defaultValue="11.4" aria-label="Target median sentence length" />
```

Notes
- Focus is a prussian border plus a 3px `--accent-quiet` halo, never a browser outline.
- `mono` for anything numeric so digits align in a column.
