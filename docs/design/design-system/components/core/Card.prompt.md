One-sentence: a surface container — `ink`/`panel`/`outline` for instrument chrome, `paper` strictly for story prose and verbatim exemplars.

```jsx
<Card ground="ink"><CardHeader meta="Prosody" title="Measured" />…</Card>
<Card ground="paper" padding="lg"><Markdown>{story}</Markdown></Card>
<Card ground="outline" interactive selected>…</Card>
<Card accent="var(--edited)">…</Card>
```

Notes
- `paper` carries `--shadow-paper` and near-square 2px corners: it reads as a printed sheet on a desk.
- `accent` is a 3px top rule; only pass provenance/status tokens (`--derived`, `--edited`, `--status-fail`).
- `interactive` + `selected` is the author-search result pattern.
