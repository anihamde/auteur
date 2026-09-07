# Design source of truth

Two bundles, both authored against `docs/PRD.md` draft v0.1 and both checked in
verbatim so that a value in a component can be traced to the file it came from.

| Directory | What it is |
|---|---|
| `design-system/` | The auteur design system: `tokens/*.css` (authoritative values), 26 foundation specimen cards, 15 React primitives with `.d.ts` prop contracts and `.prompt.md` usage notes, the seven-step click-through kit, and `readme.md` — the full design guide. |
| `wizard-handoff/` | The wizard prototype and its handoff note: all seven screens plus the model-selection overlay, screen by screen, with the exact copy. |

## Rules that follow from checking these in

- **`design-system/tokens/*.css` is the only place a design value is written
  down.** `packages/tokens` is that file set expressed as a Panda preset, and
  its test re-reads these files at test time rather than transcribing them, so a
  wrong hex digit or a rounded pixel is a red build. See
  `docs/ARCHITECTURE.md` §8.
- **`design-system/components/*.d.ts` is the component contract.** Prop names
  and unions in `packages/component-library` match them exactly; `.prompt.md`
  next to each says when to reach for it.
- **`design-system/_adherence.oxlintrc.json`** enumerates every declared prop
  and union as lint rules. It is the design tool's own output, kept because it
  is a machine-readable statement of the same contract.
- **Do not port `wizard-handoff/support.js`.** It is the prototype's streaming
  runtime and the handoff note says so. `wizard-handoff/theme.js` is the
  opposite case — small, dependency-free, and ported close to as-is.

## Where these bundles are wrong

Both were authored without the repository, so `design-system/readme.md` states
that the eight `packages/component-library` primitives the PRD §12 inventory
names were implemented from their names rather than from argo-browser's source.
That guess turned out closer than the PRD's plan: see `docs/ARCHITECTURE.md` §2
for why the library is built from these token files rather than ported.

Four places where the bundles disagree with the PRD, or with each other, are
resolved in `docs/ARCHITECTURE.md` §13. The resolution wins; these files are
not edited to match it.
