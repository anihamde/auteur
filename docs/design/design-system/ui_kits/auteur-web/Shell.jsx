const { WizardRail, Icon, Badge, Button, ThemeToggle } = window.AuteurDesignSystem_11e1bd;

function Mark({ size = 44 }) {
  return (
    <span aria-hidden="true" style={{ fontFamily: 'var(--font-script)', fontSize: size, lineHeight: 0.78, color: 'var(--text-strong)', flex: '0 0 auto' }}>A</span>
  );
}

function AppShell({ steps, current, onStep, session, children }) {
  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--surface-app)' }}>
      <WizardRail
        steps={steps} current={current} onStep={onStep}
        header={<Wordmark />}
        footer={<SessionFooter session={session} />}
      />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>{children}</main>
    </div>
  );
}

function Wordmark({ size = 'var(--text-xl)' }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', lineHeight: 1, color: 'var(--text-strong)' }}>
        <Mark size={44} />
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: size, lineHeight: 1, letterSpacing: 'var(--tracking-snug)', marginLeft: -1 }}>uteur</span>
      </span>
      <span style={{ font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-faint)' }}>style from evidence</span>
    </span>
  );
}

function SessionFooter({ session = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', borderTop: '1px solid var(--border-hairline)', paddingTop: 'var(--space-3)' }}>
      <Row label="session" value={session.id || 'local-4f2a'} />
      <Row label="spend" value={session.spend || '$0.00'} />
      <Row label="router" value="ramp" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', paddingTop: 'var(--space-1)' }}>
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-faint)' }}>theme</span>
        {ThemeToggle ? <ThemeToggle size="sm" /> : null}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
      <span style={{ font: 'var(--type-caption)', color: 'var(--text-faint)' }}>{label}</span>
      <span style={{ font: 'var(--type-data)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

function StepHeader({ index, title, blurb, aside }) {
  return (
    <header style={{ borderBottom: '1px solid var(--border-hairline)', padding: 'var(--space-8) var(--gutter-screen) var(--space-6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-8)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0 }}>
        <span style={{ font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-faint)' }}>Step {index} of 7</span>
        <h1 style={{ font: 'var(--type-title)' }}>{title}</h1>
        {blurb ? <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', maxWidth: 'var(--measure-ui)' }}>{blurb}</p> : null}
      </div>
      {aside}
    </header>
  );
}

function StepBody({ children, style }) {
  return <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 'var(--space-8) var(--gutter-screen)', ...style }}>{children}</div>;
}

function StepFooter({ back, onBack, children }) {
  return (
    <footer style={{ height: 'var(--space-16)', flex: '0 0 auto', borderTop: '1px solid var(--border-hairline)', background: 'var(--surface-panel)', padding: '0 var(--gutter-screen)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      {back ? <Button variant="ghost" onClick={onBack}><Icon name="arrow-left" size={14} />{back}</Button> : null}
      <span style={{ flex: 1 }} />
      {children}
    </footer>
  );
}

function SectionLabel({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', borderBottom: '1px solid var(--border-hairline)', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
      <span style={{ font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-faint)' }}>{children}</span>
      {action}
    </div>
  );
}

Object.assign(window, { AppShell, Wordmark, Mark, StepHeader, StepBody, StepFooter, SectionLabel });
