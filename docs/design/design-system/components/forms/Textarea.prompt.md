One-sentence: multi-line entry; `prose` + `counter` is the step-1 idea field, which accepts one sentence or pages of notes.

```jsx
<Textarea prose counter rows={7} value={idea} onChange={e => setIdea(e.target.value)}
  placeholder="A lighthouse keeper who has stopped writing in the log…" />
```

Notes
- `prose` sets the serif face and prose leading; the user is writing, so it should look like writing.
- Never impose a max length on the idea field.
