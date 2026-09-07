const { Button, Icon, Badge, Card, Markdown } = window.AuteurDesignSystem_11e1bd;

function OutlineStep({ onNext, onBack }) {
  const D = window.AUTEUR_DATA;
  return (
    <>
      <StepHeader index={5} title="Seven beats" blurb="Approve, edit any beat, or regenerate. The draft stage receives this outline verbatim."
        aside={<div style={{ display: 'flex', gap: 'var(--space-2)' }}><Badge tone="balanced">balanced</Badge><Badge tone="neutral" mono>outline · 4.1s</Badge></div>} />
      <StepBody>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 'var(--space-10)', alignItems: 'start' }}>
          <Card ground="paper" padding="lg">
            <Markdown ground="paper">{D.outline}</Markdown>
          </Card>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <div>
              <SectionLabel>Before drafting</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <Estimate label="Stage" value="draft" />
                <Estimate label="Tier" value="strong" />
                <Estimate label="Strategy" value="single-call" />
                <Estimate label="Est. tokens out" value="6,200" />
                <Estimate label="Est. cost" value="$0.11" strong />
                <Estimate label="Est. time" value="2m 40s" />
              </div>
            </div>
            <p style={{ font: 'var(--type-caption)', color: 'var(--text-faint)', lineHeight: 'var(--leading-normal)' }}>
              A novelette is roughly 5× a short story. You should choose that knowingly.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <Button variant="secondary" fullWidth><Icon name="refresh-cw" size={14} />Regenerate outline</Button>
              <Button variant="ghost" fullWidth>Edit beats</Button>
            </div>
          </aside>
        </div>
      </StepBody>
      <StepFooter back="Questions" onBack={onBack}>
        <Button variant="primary" size="lg" onClick={onNext}>Approve and draft<Icon name="arrow-right" size={14} /></Button>
      </StepFooter>
    </>
  );
}

function Estimate({ label, value, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-1-5) 0', borderBottom: '1px solid var(--border-hairline)' }}>
      <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ font: 'var(--type-data)', color: strong ? 'var(--tier-strong)' : 'var(--text-body)' }}>{value}</span>
    </div>
  );
}

Object.assign(window, { OutlineStep, Estimate });
