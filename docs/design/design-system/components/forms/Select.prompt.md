One-sentence: native select for the style card's enum fields (pov, tense, register, length preset).

```jsx
<Select options={[{ value: 'flash', label: 'Flash — ~1k words' }, { value: 'short', label: 'Short — ~4k' }]} />
```

Notes
- Options are short and lowercase where they mirror schema enum values.
- Use for closed sets only; open sets are `Input` with suggestions.
