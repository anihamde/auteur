const { Button, Input, Icon, Badge, Card } = window.AuteurDesignSystem_11e1bd;

function AuthorStep({ state, set, onNext, onBack }) {
  const D = window.AUTEUR_DATA;
  const [q, setQ] = React.useState('');
  const list = D.authors.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));
  const chosen = D.authors.find((a) => a.id === state.author);
  return (
    <>
      <StepHeader index={2} title="In whose voice?" blurb="Search the corpus index. Only authors with public-domain full text can carry a computed prosody block."
        aside={<div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}><Badge tone="measured">full-text</Badge><Badge tone="neutral">secondary</Badge></div>} />
      <StepBody>
        <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Input size="lg" icon={<Icon name="search" size={16} />} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search authors in the corpus index…" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {list.map((a) => {
              const on = a.id === state.author;
              const off = a.provenance === 'secondary';
              return (
                <Card key={a.id} ground="outline" padding="sm" interactive={!off} selected={on}
                  onClick={off ? undefined : () => set({ author: a.id })}
                  style={{ opacity: off ? 0.55 : 1, display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 'var(--radius-round)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`, background: on ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-on-accent)', flex: '0 0 auto' }}>
                    {on ? <Icon name="check" size={9} /> : null}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-md)', color: 'var(--text-strong)' }}>{a.name}</span>
                      <span style={{ font: 'var(--type-data)', fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{a.dates}</span>
                    </div>
                    <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{a.note}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flex: '0 0 auto' }}>
                    <span style={{ font: 'var(--type-data)', fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', textAlign: 'right' }}>
                      {a.works ? `${a.works} works` : 'no primary text'}<br />{a.words} words
                    </span>
                    <Badge tone={off ? 'neutral' : 'measured'}>{a.provenance}</Badge>
                  </div>
                </Card>
              );
            })}
          </div>
          <p style={{ font: 'var(--type-caption)', color: 'var(--text-faint)', maxWidth: 'var(--measure-ui)' }}>
            A <span style={{ fontFamily: 'var(--font-mono)' }}>secondary</span> card is built from interviews and criticism, has no computed prosody and no verbatim exemplars, and gets a lower confidence. Not available in v1.
          </p>
        </div>
      </StepBody>
      <StepFooter back="Idea" onBack={onBack}>
        <Button variant="primary" size="lg" disabled={!chosen} onClick={onNext}>
          Build the style card<Icon name="arrow-right" size={14} />
        </Button>
      </StepFooter>
    </>
  );
}

Object.assign(window, { AuthorStep });
