One-sentence: one row of the computed prosody block, optionally plotted against the corpus interquartile band.

```jsx
<ProsodyStat label="Mean sentence length" value={11.4} unit=" words" band={[4, 34]} target={11.4} status="pass" />
<ProsodyStat label="Em dash" value={2.1} unit="/1k" />
<ProsodyStat label="Dialogue ratio" value="0.41" status="drift" />
```

Notes
- Values are mono and tabular so a column of stats aligns.
- Use `status` only on the style-fit report, where a verdict exists; the style card itself is neutral (a measurement is not a score).
- The `target` hairline is `prosodyTarget`; the colored marker is the measurement. Never merge them.
