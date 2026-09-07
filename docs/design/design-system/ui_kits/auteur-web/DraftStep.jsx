const { Button, Icon, Badge, Card, Markdown, Thinking, ProsodyStat } = window.AuteurDesignSystem_11e1bd;

function DraftStep({ onNext, onBack }) {
  const D = window.AUTEUR_DATA;
  const [chars, setChars] = React.useState(0);
  React.useEffect(() => {
    if (chars >= D.draft.length) return;
    const t = setTimeout(() => setChars(Math.min(D.draft.length, chars + 14)), 22);
    return () => clearTimeout(t);
  }, [chars]);
  const streaming = chars < D.draft.length;
  const words = D.draft.slice(0, chars).trim().split(/\s+/).filter(Boolean).length;
  return (
    <>
      <StepHeader index={6} title={streaming ? 'Drafting' : 'Draft complete'} blurb="Prose streams as it is written. You can leave and come back — the session is persisted."
        aside={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Badge tone="strong">strong</Badge>
            <span style={{ font: 'var(--type-data)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>{words} / ~940 words</span>
          </div>
        } />
      <StepBody style={{ background: 'var(--surface-panel)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 260px', gap: 'var(--space-10)', alignItems: 'start' }}>
          <Card ground="paper" padding="lg" style={{ padding: '48px 56px' }}>
            <Markdown ground="paper" streaming={streaming}>{D.draft.slice(0, chars)}</Markdown>
          </Card>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', position: 'sticky', top: 0 }}>
            <div>
              <SectionLabel>Live prosody</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <ProsodyStat label="Mean sentence length" value={31.2} unit=" w" band={[6, 52]} target={24.6} status="drift" />
                <ProsodyStat label="Semicolon" value={5.9} unit="/1k" band={[0, 14]} target={6.4} status="pass" />
                <ProsodyStat label="Dialogue ratio" value={0.0} band={[0, 1]} target={0.08} status="pass" />
              </div>
            </div>
            <Thinking stage="draft" tier="strong" state={streaming ? 'running' : 'done'} elapsed={streaming ? '1m 12s' : '2m 31s'}
              detail={streaming ? ['beat 3 of 7'] : ['7 beats drafted', 'handing to critique']} />
            <Button variant="danger" size="sm" fullWidth>Stop and keep what exists</Button>
          </aside>
        </div>
      </StepBody>
      <StepFooter back="Outline" onBack={onBack}>
        <Button variant="primary" size="lg" disabled={streaming} onClick={onNext}>
          Style-fit report<Icon name="arrow-right" size={14} />
        </Button>
      </StepFooter>
    </>
  );
}

Object.assign(window, { DraftStep });
