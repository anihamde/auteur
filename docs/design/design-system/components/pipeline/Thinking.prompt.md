One-sentence: shows a pipeline stage running, with its tier and the lines it streams — the step-3 research view is a stack of these.

```jsx
<Thinking stage="corpus-select" tier="cheap" state="done" elapsed="1.8s"
  detail={['12 works indexed', 'sampling across career period', '31 passages selected']} />
<Thinking stage="style-extract" tier="balanced" state="running" elapsed="6.4s" detail={['reading Dubliners, ch. 4…']} />
```

Notes
- `stage` is the literal pipeline stage id, mono — the app names its own machinery honestly.
- Detail lines are facts, lowercase, no ellipsis except on the line still in progress.
- `failed` turns dot and label oxblood; the stage stays in the stack rather than disappearing.
