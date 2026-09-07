const { Button, Icon, Badge, Card, Thinking, ProsodyStat, ProvenanceMark, Exemplar } = window.AuteurDesignSystem_11e1bd;

function ResearchStep({ onNext, onBack }) {
  const D = window.AUTEUR_DATA;
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    if (n >= D.research.length) return;
    const t = setTimeout(() => setN(n + 1), n === 0 ? 700 : 1100);
    return () => clearTimeout(t);
  }, [n]);
  const done = n >= D.research.length;
  return (
    <>
      <StepHeader index={3} title="Reading Borges" blurb="Corpus selection, deterministic prosody, then extraction from cited passages. You do not have to do anything here."
        aside={done ? <Badge tone="measured">card v3 · confidence 0.91</Badge> : <Badge tone="accent">building</Badge>} />
      <StepBody>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,380px) minmax(0,1fr)', gap: 'var(--space-10)', alignItems: 'start' }}>
          <div>
            <SectionLabel>Pipeline</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {D.research.map((s, i) => (
                <Thinking key={s.stage} stage={s.stage} tier={s.tier || undefined}
                  state={i < n ? 'done' : i === n ? 'running' : 'pending'}
                  elapsed={i <= n ? s.elapsed : undefined}
                  detail={i <= n ? s.detail.slice(0, i < n ? s.detail.length : 2) : []} />
              ))}
            </div>
            {done ? (
              <div style={{ marginTop: 'var(--space-6)' }}>
                <SectionLabel>Measured prosody</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {D.prosody.slice(0, 6).map((p) => <ProsodyStat key={p.label} {...p} />)}
                </div>
                <div style={{ marginTop: 'var(--space-3)' }}><ProvenanceMark origin="measured" source="412,118 words" /></div>
              </div>
            ) : null}
          </div>
          <div style={{ opacity: done ? 1 : 0.25, transition: 'opacity var(--dur-slow) var(--ease-out)' }}>
            <StyleCardPanel card={D.card} exemplars={D.exemplars} />
          </div>
        </div>
      </StepBody>
      <StepFooter back="Author" onBack={onBack}>
        <Button variant="secondary" disabled={!done}>Export card</Button>
        <Button variant="primary" size="lg" disabled={!done} onClick={onNext}>
          Answer 3 questions<Icon name="arrow-right" size={14} />
        </Button>
      </StepFooter>
    </>
  );
}

function CardRow({ path, value, origin, source }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr)', gap: 'var(--space-4)', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border-hairline)', alignItems: 'baseline' }}>
      <span style={{ font: 'var(--type-data)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>{path}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span style={{ font: 'var(--type-body)', color: 'var(--text-body)' }}>{value}</span>
        <ProvenanceMark origin={origin} source={source || undefined} />
      </div>
    </div>
  );
}

function ChipList({ items, tone = 'neutral' }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1-5)' }}>
      {items.map((t) => <Badge key={t} tone={tone} mono>{t}</Badge>)}
    </div>
  );
}

function StyleCardPanel({ card, exemplars }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <Card ground="panel" padding="md">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <h2 style={{ font: 'var(--type-title)' }}>{card.author}</h2>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Badge tone="measured">{card.provenance}</Badge>
            <Badge tone="neutral" mono>{card.version}</Badge>
          </div>
        </div>
        <SectionLabel>voice</SectionLabel>
        {card.voice.map((r) => <CardRow key={r[0]} path={`voice.${r[0]}`} value={r[1]} origin={r[2]} source={r[3]} />)}
        <div style={{ height: 'var(--space-5)' }} />
        <SectionLabel>diction</SectionLabel>
        {card.diction.map((r) => <CardRow key={r[0]} path={`diction.${r[0]}`} value={r[1]} origin={r[2]} source={r[3]} />)}
        <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr)', gap: 'var(--space-4)', padding: 'var(--space-3) 0' }}>
          <span style={{ font: 'var(--type-data)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>signatureLexicon</span>
          <ChipList items={card.lexicon} tone="accent" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr)', gap: 'var(--space-4)', padding: '0 0 var(--space-3)' }}>
          <span style={{ font: 'var(--type-data)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>avoidedRegisters</span>
          <ChipList items={card.avoided} />
        </div>
        <SectionLabel>structure</SectionLabel>
        {card.structure.map((r) => <CardRow key={r[0]} path={`structure.${r[0]}`} value={r[1]} origin={r[2]} source={r[3]} />)}
        <div style={{ height: 'var(--space-5)' }} />
        <SectionLabel>antiPatterns</SectionLabel>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {card.antiPatterns.map((t) => (
            <li key={t} style={{ display: 'flex', gap: 'var(--space-2)', font: 'var(--type-body)', color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--status-fail)', flex: '0 0 auto', marginTop: 2 }}><Icon name="minus" size={14} /></span>{t}
            </li>
          ))}
        </ul>
      </Card>
      <div>
        <SectionLabel action={<span style={{ font: 'var(--type-caption)', color: 'var(--text-faint)' }}>14 cited · 3 shown</span>}>exemplars — verbatim, never editable</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {exemplars.map((e, i) => <Exemplar key={i} {...e} selected={i === 0} onSelect={() => {}} />)}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ResearchStep, StyleCardPanel, CardRow, ChipList });
