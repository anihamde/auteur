One-sentence: wraps one control with its label, hint or error, and — for style-card fields — its provenance mark.

```jsx
<Field label="Narrator distance" hint="How close the narration sits to the character." provenance="derived">
  <Select options={['close', 'middle', 'ironic remove']} />
</Field>
```

Notes
- `provenance="edited"` turns the mark amber; that field no longer counts as cited evidence and the style-fit report must score it separately.
- `error` replaces `hint`; never show both.
