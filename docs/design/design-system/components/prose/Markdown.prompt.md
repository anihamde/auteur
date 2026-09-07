One-sentence: renders auteur's markdown — story drafts, outlines, critique findings; `ground="paper"` + `streaming` is the step-6 draft view.

```jsx
<Card ground="paper" padding="lg"><Markdown ground="paper" streaming>{draft}</Markdown></Card>
<Markdown size="sm">{critiqueFindings}</Markdown>
```

Notes
- Paragraphs after the first get a 1.4em first-line indent on paper — book setting, not web setting.
- `streaming` adds the caret; drop it the moment the stage finishes.
- Measure is capped at `--measure-prose` (66ch). Never widen it for story text.
