const { Button, Field, Textarea, Select, Icon, Badge } = window.AuteurDesignSystem_11e1bd;

function IdeaStep({ state, set, onNext }) {
  const D = window.AUTEUR_DATA;
  const preset = D.lengths.find((l) => l.value === state.length) || D.lengths[1];
  return (
    <>
      <StepHeader index={1} title="What is the story?" blurb="One sentence or pages of notes. Nothing here is discarded — the idea is sent to every stage of the pipeline." />
      <StepBody>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 260px', gap: 'var(--space-10)', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <Field label="Idea" required hint="Premise, image, constraint, or a page of notes — any length.">
              <Textarea prose counter rows={9} value={state.idea} onChange={(e) => set({ idea: e.target.value })}
                placeholder="A lighthouse keeper stops writing in the log, and the log keeps writing itself." />
            </Field>
            <Field label="Hard constraints" hint="Things the draft must or must not do. Optional.">
              <Textarea rows={2} value={state.constraints} onChange={(e) => set({ constraints: e.target.value })}
                placeholder="No dialogue. Must end on a footnote." />
            </Field>
          </div>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <Field label="Length" hint="A preset selects a draft strategy, not a cap.">
              <Select value={state.length} onChange={(e) => set({ length: e.target.value })} options={D.lengths} />
            </Field>
            <div style={{ background: 'var(--surface-panel)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-card)', padding: 'var(--gutter-card-tight)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <span style={{ font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-faint)' }}>Resolved strategy</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Badge tone="accent" mono>{preset.strategy}</Badge>
              </div>
              <p style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', lineHeight: 'var(--leading-normal)' }}>
                {preset.strategy === 'single-call'
                  ? 'One call. Best global coherence — the model holds the whole shape at once.'
                  : 'One call per outline beat, each given the style card, the outline, a running story-state summary, and the last ~500 words verbatim.'}
              </p>
            </div>
          </aside>
        </div>
      </StepBody>
      <StepFooter>
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-faint)' }}>Nothing is generated yet.</span>
        <Button variant="primary" size="lg" disabled={!state.idea.trim()} onClick={onNext}>
          Choose an author<Icon name="arrow-right" size={14} />
        </Button>
      </StepFooter>
    </>
  );
}

Object.assign(window, { IdeaStep });
