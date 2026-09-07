One-sentence: the small diamond-and-caps mark that tells the user whether a style-card field is measured, model-derived from cited passages, or user-edited.

```jsx
<ProvenanceMark origin="measured" />
<ProvenanceMark origin="derived" source="The Garden of Forking Paths" />
<ProvenanceMark origin="edited" onReset={() => resetField('voice.pov')} />
```

Notes
- Every style-card field carries one. Absence would imply the card is uniformly cited, which after any edit it is not.
- `edited` is amber and offers `reset`; that field is excluded from the author-statistics half of the style-fit report.
