const { Button, Icon, Badge, Card, Textarea } = window.AuteurDesignSystem_11e1bd;

function ClarifyStep({ state, set, onNext, onBack }) {
  const D = window.AUTEUR_DATA;
  const [answers, setAnswers] = React.useState(() => {
    const seed = {};
    D.questions.forEach((q) => { if (q.answer) seed[q.id] = q.answer; });
    return seed;
  });
  const [round, setRound] = React.useState(1);
  const visible = D.questions.filter((q) => q.round <= round);
  const answered = visible.filter((q) => answers[q.id]).length;
  const roundDone = visible.every((q) => answers[q.id] !== undefined);
  return (
    <>
      <StepHeader index={4} title="Three things are still ambiguous" blurb="Answer them, or skip and the model chooses — every choice it makes is recorded in the decisions log."
        aside={
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-2)' }}>
            <span style={{ font: 'var(--type-data)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>round {round} of 3 · {answered}/8 questions</span>
            <div style={{ display: 'flex', gap: 3 }}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <span key={i} style={{ width: 16, height: 3, background: i < answered ? 'var(--accent)' : 'var(--track)' }} />
              ))}
            </div>
          </div>
        } />
      <StepBody>
        <div style={{ maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {visible.map((q, i) => (
            <QuestionBlock key={q.id} q={q} n={i + 1} answer={answers[q.id]}
              onAnswer={(v) => setAnswers({ ...answers, [q.id]: v })} />
          ))}
          {round === 1 && roundDone ? (
            <Card ground="outline" padding="sm" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <span style={{ color: 'var(--text-accent)' }}><Icon name="git-branch" size={16} /></span>
              <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)', flex: 1 }}>
                Your answer to q1 opened one new decision. A follow-up round is available.
              </span>
              <Button variant="quiet" size="sm" onClick={() => setRound(2)}>Show it</Button>
            </Card>
          ) : null}
        </div>
      </StepBody>
      <StepFooter back="Research" onBack={onBack}>
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-faint)' }}>Skipping is never blocked.</span>
        <Button variant="secondary" onClick={onNext}>Generate now</Button>
        <Button variant="primary" size="lg" onClick={onNext}>Outline<Icon name="arrow-right" size={14} /></Button>
      </StepFooter>
    </>
  );
}

function QuestionBlock({ q, n, answer, onAnswer }) {
  const [own, setOwn] = React.useState('');
  const skipped = answer === '__skip';
  return (
    <Card ground="ink" padding="md" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', opacity: skipped ? 0.6 : 1 }}>
      <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
        <span style={{ font: 'var(--type-data)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginTop: 4 }}>q{n}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0 }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)', fontWeight: 400, lineHeight: 'var(--leading-snug)', color: 'var(--text-strong)', textWrap: 'pretty' }}>{q.text}</h3>
          <p style={{ font: 'var(--type-caption)', color: 'var(--text-faint)', maxWidth: 'var(--measure-prose)', lineHeight: 'var(--leading-normal)' }}>
            <span style={{ color: 'var(--text-accent)' }}>Why asked — </span>{q.why}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', paddingLeft: 'var(--space-8)' }}>
        {q.suggestions.map((s) => {
          const on = answer === s;
          return (
            <Button key={s} size="sm" variant={on ? 'primary' : 'quiet'} onClick={() => onAnswer(s)}>
              {on ? <Icon name="check" size={12} /> : null}{s}
            </Button>
          );
        })}
        <Button size="sm" variant="ghost" onClick={() => onAnswer('__skip')}>{skipped ? 'Skipped — model chooses' : 'You decide'}</Button>
      </div>
      {answer && !skipped ? (
        <div style={{ paddingLeft: 'var(--space-8)' }}>
          <Textarea rows={1} value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Add a note to this answer (optional)" />
        </div>
      ) : null}
    </Card>
  );
}

Object.assign(window, { ClarifyStep });
