One-sentence: the action control — `primary` for the single forward action on a wizard step, `secondary` for back/alternatives, `ghost` for tertiary chrome, `quiet` for a model's suggested answer chip, `danger` for destructive resets.

```jsx
<Button variant="primary" size="lg">Generate now</Button>
<Button variant="secondary"><Icon name="arrow-left" size={14} />Back</Button>
<Button variant="quiet" size="sm">You decide</Button>
<Button variant="primary" loading>Drafting…</Button>
```

Notes
- "Generate now" is always live in the clarify stage; never render it disabled to gate a question.
- `quiet` is the suggested-answer treatment in step 4 — prussian tint, accent text, no border.
- One `primary` per screen. Two primaries means the step has two forward paths, which the wizard does not have.
