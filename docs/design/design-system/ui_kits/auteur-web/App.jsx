function App() {
  const D = window.AUTEUR_DATA;
  const [step, setStep] = React.useState(0);
  const [state, setState] = React.useState({
    idea: 'A lighthouse keeper stops writing in the log, and the log keeps writing itself.',
    constraints: '', length: 'short', author: 'borges',
  });
  const set = (patch) => setState((s) => ({ ...s, ...patch }));
  const next = () => setStep((s) => Math.min(6, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const spend = ['$0.00', '$0.00', '$0.02', '$0.03', '$0.04', '$0.13', '$0.14'][step];
  const props = { state, set, onNext: next, onBack: back };
  return (
    <AppShell steps={D.steps} current={step} onStep={setStep} session={{ id: 'local-4f2a', spend }}>
      {step === 0 ? <IdeaStep {...props} /> : null}
      {step === 1 ? <AuthorStep {...props} /> : null}
      {step === 2 ? <ResearchStep {...props} /> : null}
      {step === 3 ? <ClarifyStep {...props} /> : null}
      {step === 4 ? <OutlineStep {...props} /> : null}
      {step === 5 ? <DraftStep {...props} /> : null}
      {step === 6 ? <ResultStep {...props} onRestart={() => setStep(0)} /> : null}
    </AppShell>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
