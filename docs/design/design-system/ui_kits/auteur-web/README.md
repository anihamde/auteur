# UI kit — auteur web (`apps/auteur-web`)

A click-through recreation of the only surface in v1 scope: the seven-step
wizard described in PRD §6. Single-user, runs locally, no accounts, no
marketing site — so this is the whole product.

**No production code or Figma file existed for this app when the kit was
built.** It is a design proposal derived from the PRD's step table, style-card
schema, pipeline table and success criteria — not a recreation of a shipped
UI. Treat layout decisions as proposals, and the token/component usage as
binding.

## Run it

Open `index.html`. All seven steps are navigable: the left rail advances
automatically and completed steps stay clickable (§6 — "every step is
re-enterable").

| Step | File | What is interactive |
|---|---|---|
| 1 Idea | `IdeaStep.jsx` | Prose textarea with live word count; length preset resolves a draft strategy |
| 2 Author | `AuthorStep.jsx` | Search-as-you-type filter; `secondary`-tier authors are visibly disabled |
| 3 Research | `ResearchStep.jsx` | Stages complete on a timer; style card fades in with per-field provenance |
| 4 Questions | `ClarifyStep.jsx` | Suggested answers, "you decide" skip, round-2 follow-up appears after round 1 |
| 5 Outline | `OutlineStep.jsx` | Beat sheet on paper; pre-draft cost/time estimate |
| 6 Draft | `DraftStep.jsx` | Prose streams character-by-character with live prosody drift |
| 7 Result | `ResultStep.jsx` | Story / Style fit / Decisions log tabs |

`Shell.jsx` holds the app shell (rail, step header, body, footer).
`data.js` holds all fake content — Borges style card, exemplars, questions,
draft, style-fit findings, decisions log.

## Composition

Every control comes from the design system bundle (`window.AuteurDesignSystem_11e1bd`):
`Button`, `Field`, `Input`, `Select`, `Textarea`, `Card`, `Badge`, `Icon`,
`Markdown`, `Exemplar`, `Thinking`, `ProsodyStat`, `ProvenanceMark`,
`WizardRail`. Nothing is re-implemented locally except layout scaffolding.

## The one rule the kit exists to demonstrate

Instrument on ink; artifact on paper. Every screen where the user reads
generated prose or a verbatim quote puts it on a cream `Card ground="paper"`
with a real drop shadow. Every screen where the user reads measurements puts
them on the dark ground in mono. Step 6 shows both at once, which is the point.
