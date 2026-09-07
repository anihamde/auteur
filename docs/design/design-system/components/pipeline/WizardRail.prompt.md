One-sentence: the wizard's fixed 236px left rail listing the seven steps, with completed steps clickable.

```jsx
<WizardRail current={3} onStep={goTo}
  header={<span style={{ font: 'var(--type-title)' }}>auteur</span>}
  steps={[{ label: 'Idea' }, { label: 'Author' }, { label: 'Research' }, { label: 'Questions', note: '4' },
          { label: 'Outline' }, { label: 'Draft' }, { label: 'Result' }]} />
```

Notes
- Pending steps are never clickable; completed ones always are — §6 requires every step re-enterable.
- The current step gets a 2px prussian left rule and a `--surface-selected` ground.
- `note` carries a count or duration, mono, right-aligned.
