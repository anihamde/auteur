# Handoff: auteur — the seven-step wizard

## Overview

auteur is a story generator whose differentiator is that the style is extracted
from evidence, not recalled from a model's impression of a name. You give it an
idea and an author; it fetches that author's public-domain corpus, measures it,
builds an inspectable **style card**, asks clarifying questions generated *from
that card*, drafts a story, and scores the draft against the corpus.

This bundle is the design for the only user-facing surface in v1 scope: the
seven-step wizard (`apps/auteur-web` in the PRD's architecture). It is a
click-through prototype covering all seven steps, plus a session-level model
selection panel.

`PRD.md` (draft v0.1) is included verbatim — it is the source of truth for
scope, schema, pipeline and success criteria. This README describes the design
only.

## About the design files

The files in this bundle are **design references created in HTML** — a
prototype showing intended look and behaviour, not production code to copy.
`Auteur Wizard.dc.html` runs in a browser and uses a small in-house streaming
runtime (`support.js`) that will not exist in your codebase; don't port it.

The task is to **recreate these designs in the target codebase's environment**.
For auteur that environment is specified by the PRD §12: Vite + React in
`apps/auteur-web`, styled with the Panda preset inherited from
`packages/component-library`. If that package is not yet available, implement
the design-system primitives from the CSS token files in this bundle, which are
the authoritative values.

## Fidelity

**High-fidelity.** Colours, typography, spacing, borders, motion and copy are
final and come from a real design system (bundled under `_ds/` and documented in
`design_system/readme.md`). Recreate the UI faithfully using the tokens in
`_ds/.../tokens/*.css` rather than re-deriving values by eye. Content is sample
data: the sample session is an idea about Halley's Comet in the style of Jorge
Luis Borges, and every number, exemplar, question and finding in the prototype
is fabricated for demonstration.

## The one structural rule

**Ink for the instrument, paper for the artifact.** The app chrome —
measurements, stage ids, tiers, provenance marks, costs — sits on a dark
prussian-cast ink ground in Archivo (chrome) and IBM Plex Mono (anything
numeric). Generated prose, the outline and verbatim exemplars sit on warm cream
paper cards in EB Garamond with a real drop shadow and book-style paragraph
indents. Prose on the dark ground, or a prosody number on cream, is wrong.

Two themes. Dark is the instrument; light (`data-theme="light"`) re-points the
semantic aliases onto the paper ramp so the whole surface becomes cream and the
ink/paper distinction collapses on purpose. Only `tokens/theme-light.css`
differs. Default mode is `auto`, resolved by local clock (light 06:00–18:00),
re-checked each minute; an explicit choice persists in `localStorage` under
`auteur.theme`. `theme.js` in this bundle is the resolver and must run in
`<head>` before first paint.

## App shell

Fixed left rail (236px) + one scrolling column. No topbar.

- **Rail** — `--surface-panel` ground, 1px `--border-hairline` right edge,
  `--space-5` vertical padding.
  - Header: the wordmark — a Great Vibes capital `A` at 44px that *is* the
    word's own A, followed by `uteur` in EB Garamond at `--text-xl`, baselines
    aligned, `margin-left: -1px`, `letter-spacing: --tracking-snug`; under it
    the eyebrow `style from evidence` in uppercase `--type-eyebrow` at
    `--text-faint`.
  - Steps: seven rows, `--space-2 --space-5` padding. Current row has a 2px
    prussian left rule and `--surface-selected` ground; completed rows show a
    laurel Lucide `check` in place of the number and stay clickable (every step
    is re-enterable); pending rows are `--text-faint` and disabled. Each row
    carries an optional right-aligned mono note (`1,042w`, `borges`, `card@3`,
    `3/8`, `6`, `flash`).
  - Footer, above a hairline: `session local-4f2a`, `router ramp`, `spend
    $0.04`, a `models` row whose quiet button opens the model panel (label `by
    tier`, or `n pinned` once anything is overridden), and a `theme` row with
    the Auto/Light/Dark segmented toggle.
- **Main column** — `header` (bottom hairline, `--space-8 --gutter-screen
  --space-6` padding: eyebrow `Step n of 7`, `--type-title` h1, `--type-body`
  blurb capped at `--measure-ui`, optional right-aligned mono aside), a
  scrolling `body` (`--space-8 --gutter-screen`), and a fixed `footer`
  (`--space-16` = 64px tall, top hairline, `--surface-panel`, back button left,
  forward actions right).

## Screens

### 1 Idea

*Purpose:* capture the idea verbatim and pick a length.

Header: "What is the story about?" / "One sentence or pages of notes. The
questions later are shaped by this and by the author's measured style." Aside:
live word count in mono.

Body, max 760px, `--space-8` stack:
- `Field` label "Idea", hint "Kept verbatim. Nothing here is rewritten before
  it reaches the pipeline." wrapping a 6-row `Textarea`, prefilled with the
  sample idea. The word count updates as you type.
- A two-column responsive grid (`repeat(auto-fit, minmax(220px, 1fr))`,
  `--space-6` gap):
  - `Field` "Length" wrapping a `Select` with `flash` / `short` / `long` /
    `novelette`. The field hint is the **resolved draft strategy** and changes
    with the selection: flash and short → `single-call`; long → `sequential-scene`;
    novelette → `sequential-scene, critique per scene`. This is the PRD's rule
    that length selects a strategy rather than imposing a cap.
  - `Field` "Hard constraints", hint "Optional. Anything the draft may not do.",
    wrapping an `Input`.

Footer: primary lg "Choose an author".

### 2 Author

*Purpose:* pick the author, and make the corpus tier honest.

Header: "In whose style?" / "Search the corpus index. A full-text author has
measured prosody and verbatim exemplars; a secondary author has neither."

Body, max 720px: a search `Input` (search-as-you-type, filters the list), then
outline `Card` rows. Each row: author name in EB Garamond `--text-lg`, a
`--type-caption` detail line (`12 works · 214,000 words · prosody computed, 12
exemplars`), and a right-aligned mono `Badge` carrying the tier —
`full-text` in the `measured` tone (laurel), `secondary` in `neutral`. Selected
row takes a prussian border and `--surface-selected`. The `secondary` row
(Calvino: "No public-domain corpus · no computed prosody, no exemplars") is
disabled at `opacity: 0.42, cursor: not-allowed`. Closing note: secondary-corpus
authors are designed for and not built in v1.

Footer: ghost "Idea" · caption "Changing the author later invalidates everything
but the idea." · primary lg "Build the style card".

### 3 Research + style card

*Purpose:* the user watches the corpus be measured, then reads the card.

Header: "Reading Borges" / "Prosody is computed from the full texts, outside the
model. The qualitative half is extracted from selected passages and cited back
to them." Aside: `building…` → `14.5s · complete`.

Body is a two-column grid: `minmax(0,1fr)` + a 300px aside, `--space-10` gap,
`align-items: start`.

Main column:
1. A stack of `Thinking` stages, each with a mono stage id, a state dot
   (pending grey / pulsing prussian while running / laurel check when done), an
   elapsed time, and streamed detail lines that fade up 4px as they arrive:
   - `corpus-select` — "12 works sampled across 1935–1975", "Career period and
     form balanced; 3 collections, 9 stories", "46 candidate passages marked".
   - `style-extract` — "Prosody computed on full text, outside the model",
     "voice, diction, structure, imagery, rhythm extracted from 46 passages",
     "12 exemplars cited; confidence 0.86".
   In the prototype stages complete on a 1.1s timer; in the app they are SSE
   events from the pipeline. Forward button is disabled until the card exists.
2. The style card, revealed at `--dur-slow` (340ms). Section label `Style card`
   above a hairline, with `borges@3 · full-text · confidence 0.86` in mono at
   the right. Then one row per field: a 190px left column holding the **schema
   path in mono** (`voice.pov`, `voice.narratorDistance`, `diction.register`,
   `structure.openingMoves`, `structure.closingMoves`, `antiPatterns`,
   `prosodyTarget.sentenceLength.mean`) plus a `ProvenanceMark`; the value in EB
   Garamond `--text-md` at `--leading-relaxed` on the right; hairline under each
   row. Provenance marks are the product's core semantic pair: `derived` in
   prussian with the citing work set in italic serif, `edited` in amber with a
   reset affordance. The last row is deliberately `edited` — the target mean was
   lowered from the measured 28.4 to 24 to fit flash length — which demonstrates
   the PRD's measured-vs-target and per-field-provenance rules.
3. Exemplars: section label `Exemplars — 12, selectable, never editable` with
   `9 selected` at the right, then one row per exemplar: what it demonstrates in
   `--type-caption`, the work and year in italic serif at the right. **In the
   real app each exemplar is the verbatim passage set on a paper card via the
   `Exemplar` component** (see `design_system/components/prose/Exemplar.jsx`) —
   the prototype lists citations only, deliberately, to avoid printing invented
   quotations under real titles.

Aside: section label `Computed prosody`, then `ProsodyStat` rows — sentence
length mean 28.4 words plotted on a 0–60 band with a target tick at 24; p10/p90
`9 / 52` as a bare row; semicolons 11.2/1k; em dashes 8.4/1k; dialogue ratio
0.06; type-token ratio 0.48; latinate ratio 0.34. Closing caption: "Measured
across 12 works, 214,000 words. Immutable — a measurement, not an opinion."

### 4 Clarifying questions

*Purpose:* resolve the decisions the idea left open — without ever blocking.

Header: "Three things are still ambiguous" / "Answer them, or skip and the
model chooses. Every choice it makes on your behalf is recorded in the decisions
log." Aside: `round 1 of 3 · n/8 questions` over an eight-segment budget meter
(16×3px ticks, prussian when spent, `--track` when not).

Body, max 780px, `--space-5` stack of ink `Card`s. Each question card:
- mono tag (`q1`) in a left gutter;
- the question in EB Garamond `--text-lg`, `text-wrap: pretty`;
- a **Why asked** line in `--type-caption`, the label in prussian — per the PRD,
  a question that cannot name the decision it resolves is not asked. Example:
  "The corpus opens inside a review, catalogue or footnote in 6 of 12 works.
  Your idea names a man and a comet but no frame.";
- suggested answers as `quiet` small buttons, indented `--space-8`; the picked
  one becomes `primary`;
- a ghost "You decide" that becomes "Skipped — model chooses".

When every round-1 question has an answer, an outline card appears: "Your answer
to q1 chose the catalogue frame, which opened one new decision. A follow-up
round is available." with a quiet "Show it" that reveals the round-2 question.
Follow-ups are offered, never imposed. Budget is 3 rounds / ~8 questions.

Footer: ghost "Research" · caption "Skipping is never blocked." · secondary
"Generate now" (live from the end of round one; jumps straight to the outline) ·
primary lg "Outline".

### 5 Outline

*Purpose:* approve the beat sheet.

Header: "The beat sheet" / "Approve it, edit a beat, or regenerate. Six beats at
flash length; the draft runs in one call."

Body: one paper `Card` (max 720px, `padding: lg`) — the outline is an artifact,
so it is on cream. Paper eyebrow `Outline — the return of the comet`, then six
beats: a 28px mono index column (`01`…) and the beat text in EB Garamond
`--text-md`, hairline (`--border-paper`, black at 14%) under each.

Footer: ghost "Questions" · caption naming the model the draft will run on
(`draft runs on claude-sonnet-4.5 · strong tier`) · ghost "Change model"
(opens the model panel) · secondary "Regenerate" · primary lg "Draft".

### 6 Draft

*Purpose:* watch the prose stream, and watch drift as it happens.

Header: "Drafting", aside `612 of ~1,000 words · single-call`.

Body: two-column grid, `minmax(0,1fr)` + 280px sticky aside.
- Main: a paper `Card` holding streaming prose via `Markdown` with the blinking
  prussian caret (`auteur-caret`, 1s steps). Prose is 19px EB Garamond at 1.72
  leading, capped at 66ch, 1.4em first-line indent on every paragraph after the
  first.
- Aside (`position: sticky`): section label `Drift, live`, then `ProsodyStat`
  rows with verdicts — sentence length 26.8 (pass), semicolons 6.1/1k against a
  target of 11.2 (drift, amber), dialogue ratio 0.0 (pass). This screen shows
  ink and paper at once, which is the point of the system.

Footer: ghost "Outline" · primary lg "Result".

### 7 Result

*Purpose:* read the story, read how well it matched, and see what was decided
for you.

Header: eyebrow, then the story title in `--type-title`, then `1,042 words · in
the style of Jorge Luis Borges · four of five measures inside the corpus band`.
Right: secondary "Export markdown", ghost "Regenerate a section". Below, three
tabs (`Story` / `Style fit` / `Decisions log`) as text buttons with a 2px
prussian bottom rule on the active one; inactive labels `--text-faint`.

- **Story** — a paper `Card` (max 760px) with the finished prose, and under it
  one caption line in muted paper ink: "Generated by auteur in the style of
  Jorge Luis Borges. AI-generated text; not written by the author." This line
  appears on every story view and every export.
- **Style fit** — a two-column grid (`minmax(0,1fr)` + 320px). Findings are ink
  cards with a **3px status rule along the top edge** (laurel for pass, amber
  for drift — never a coloured left border) carrying the schema path in mono, a
  verdict `Badge`, and prose that states the number and its argument. Example:
  "Semicolons run 6.1 per thousand words against 11.2 in the corpus. The corpus
  uses the semicolon to hold two clauses in the same breath; the draft prefers a
  full stop. The revise pass has three candidate joins." Closing caption records
  that one target was overridden this session and is reported against both,
  separately. Aside: `Draft against corpus` — five `ProsodyStat` rows with
  value, band, target tick and status.
- **Decisions log** — max 760px. One row per decision: a 120px uppercase mono
  origin column (`you answered` in prussian, `model chose — question skipped`
  and `model chose — not asked` in amber), then the decision and a caption
  giving its reason.

Footer: ghost "Draft" · caption "Every step is re-enterable from the rail." ·
secondary "New session".

### Model selection (overlay)

*Purpose:* let the user see and override which model runs which stage. Reached
from the rail footer `models` row and from the Outline footer's "Change model".

A fixed overlay: `--surface-scrim` (72% ink) + 6px blur, `--space-10` padding,
centred. Inside, a `panel` card at max 880px whose wrapper carries
`max-height: 100%; overflow: auto` so the panel always scrolls inside the
viewport and the footer buttons stay reachable.

Header: eyebrow `Models`, title "Which model runs which stage", body copy "Each
stage asks the router for a tier. A tier resolves to a model from the catalog at
run time — override any stage and the choice is pinned for this session.", and
`ramp · 27 models` in mono at the right.

Then a four-column table (`150px 96px minmax(0,1fr) 92px`, `--space-4` gap) with
uppercase eyebrow headers `Stage / Tier / Model / per 1M in`, one row per
pipeline stage, hairline under each:

| Stage | Role | Tier |
|---|---|---|
| `corpus-select` | research | cheap |
| `style-extract` | research | balanced |
| `clarify` | question | balanced |
| `outline` | outline | balanced |
| `draft` | draft | **strong** |
| `critique` | critique | cheap |
| `revise` | revise | **strong** |

Each row shows the stage id in mono with its role beneath in caption, a mono
`Badge` in the tier's tone (`cheap` neutral grey, `balanced` prussian, `strong`
amber), a `Select` of the models available **at that tier**, the per-1M input
price in mono, and a caption under the select: `tier default — resolved from the
catalog` in `--text-faint`, or `pinned for this session` in amber once
overridden. Sample catalog (Ramp Router): cheap — `qwen3-30b-a3b`,
`deepseek-v3.2`, `glm-4.6-air`, `gpt-5-mini`; balanced — `kimi-k2-0905`,
`deepseek-v3.2`, `claude-haiku-4.5`, `gpt-5`; strong — `claude-sonnet-4.5`,
`claude-opus-4.1`, `gpt-5`, `grok-4`.

Footer: a caption giving the session estimate and the rule that only `draft` and
`revise` pay for a strong model, then ghost "Follow tier defaults" (clears all
pins) and primary "Done".

**Implementation note.** The catalog must come from the router's model list at
run time, not be hardcoded — the PRD is explicit that tiers resolve to concrete
model IDs from the catalog plus a config map, and that the drafting model's real
max-output-tokens is what selects `single-call` vs `sequential-scene`. Per-stage
pins are session state, layered over the tier defaults exactly as the style-card
overlay layers over the canonical card.

## Interactions & behaviour

- **Navigation.** Footer back/forward buttons and the rail. Completed and
  current steps are clickable; pending steps are not. Entering step 3 restarts
  the research timers. "Generate now" on step 4 jumps to the outline. "New
  session" resets answers, round and tab to step 1.
- **Re-entry invalidation** (design intent, not yet enforced in the prototype):
  changing an answer at step 4 invalidates steps 5–7 but keeps the style card;
  changing the author invalidates everything but the idea. Answers form a tree —
  each question carries `dependsOn: questionId[]`, and editing an answer drops
  its descendants to be re-asked rather than silently keeping them.
- **Motion.** `--dur-fast` 130ms for control state changes, `--dur-base` 200ms
  for entrances, `--dur-slow` 340ms for the style-card reveal; easing
  `cubic-bezier(0.16, 0.84, 0.44, 1)`. Only four named animations exist:
  `auteur-spin` (button spinner), `auteur-pulse` (running stage dot, 1.3s),
  `auteur-caret` (streaming caret, 1s steps), `auteur-fade-up` (new detail line,
  4px rise). Nothing slides across the screen, scales or springs.
- **States.** Hover on filled = one step lighter; hover on ghost/outline =
  `--surface-hover` ground; press = one step darker plus `translateY(1px)`;
  focus = 1px prussian border plus a 3px `--accent-quiet` halo, never a browser
  outline; selected = prussian border and `--surface-selected`; disabled =
  `opacity: 0.42, cursor: not-allowed`; running = pulsing prussian dot.
- **Streaming.** Server-to-client only. The PRD chooses SSE over Hono, no
  websockets. Stage detail lines, the style card, and draft tokens all arrive
  this way; a protection gradient (`--fade-paper-bottom` / `--fade-ink-bottom`)
  covers the bottom of streaming prose.

## State

Prototype state, and a reasonable starting shape for the real app:

- `step` (0–6), `idea` (string, verbatim), `preset`
  (`flash|short|long|novelette`) → derived draft strategy, `query`, `author`
- `answers` (`{[questionId]: string | '__skip'}`), `round` (1–3)
- `stageStep` (research progress; in the app, pipeline stage states from SSE)
- `tab` (`story|fit|log`)
- `showModels`, `models` (`{[stageId]: modelId}` — session pins over tier
  defaults)

Real persistence per PRD §12: SQLite via `bun:sqlite` for sessions, style cards
(cached per author and versioned) and stories, so a half-finished wizard
survives a reload and expensive cards are reused across sessions.

## Design tokens

Do not re-derive these — use the CSS custom properties in
`_ds/auteur-design-system-*/tokens/`, which are the authoritative source:

- `colors.css` — the ink ramp (oklch hue 250, chroma ≤ 0.018), the paper ramp
  (hue 84–86), the prussian accent ramp, three semantic hues (laurel =
  measured/pass/full-text, amber = edited/drift/strong tier, oxblood = failure),
  and the semantic aliases every component must use. **Reaching past an alias to
  a ramp value breaks theming.** No gradients anywhere; no hues beyond these.
- `typography.css` — EB Garamond (prose, exemplars, titles, question text),
  Archivo 400/500/600 (all chrome), IBM Plex Mono 400 (numbers, stage ids,
  schema paths, elapsed times), Great Vibes (the mark's A only). Size scale
  10→80px at ratio 1.2; prose has its own `--text-prose: 19px` step; composed
  roles `--type-display/title/heading/body/body-prose/label/caption/eyebrow/data`;
  measures `--measure-prose: 66ch`, `--measure-ui: 52ch`.
- `spacing.css` — 4px base with 2px/6px for dense chrome, plus fixed chrome:
  rail 236px, topbar 52px, screen gutter 40px, controls 28/34/42px, footer 64px.
  These are exact and should not be renegotiated per screen.
- `effects.css` — radii (2px paper · 3px badges · 5px controls · 8px cards ·
  12px panels · 16px max), `--shadow-card` (barely visible, correct),
  `--shadow-paper` (a two-layer drop shadow — a printed sheet on a desk),
  `--shadow-modal`, the protection gradients, durations and easing.
- `base.css`, `theme-light.css` — resets and the light theme's alias
  re-pointing.

## Assets

- The mark: a Great Vibes capital `A`, set as live text, not a drawn path. It is
  the word's own A in the lockup. Below 30px, set the name in roman throughout.
  An outlined SVG export is outstanding.
- Icons: **Lucide**, loaded per-icon from the `lucide-static` CDN and applied as
  a CSS mask so every glyph inherits `currentColor`. Sizes 14/16/20 only. The
  working set here: `check`, `chevron-down`, `arrow-right`, `arrow-left`,
  `git-branch`, `clock`, `sun`, `moon`. No icon font, no sprite sheet, no inline
  SVG in screens, no emoji, and no unicode characters as icons.
- Imagery: there is none, by design. No photography, illustration, texture or
  noise. The paper surface is a flat cream fill plus a shadow, not a texture.
- Fonts are Google Fonts substitutions (see `design_system/readme.md`); if
  auteur has licensed faces, `tokens/fonts.css` is a one-file change.

## Copy rules

The interface's voice is load-bearing, so keep it when you rebuild:

- Sentence case everywhere, including buttons and table headers; the wordmark is
  lowercase `auteur` in every position; uppercase only for eyebrows and
  provenance marks, always with `--tracking-caps`.
- Address the user as *you*; the app never says "we", "I" or "Let's".
- Name the machinery honestly and in mono: `style-extract`,
  `voice.narratorDistance`, `sequential-scene`, `balanced`. Never "Analyzing…".
- Let numbers carry the argument rather than summarising them as "good match".
- Every question states why it was asked; every skip says it is never blocked.
- No emoji, ever. No exclamation marks.

## Files

- `Auteur Wizard.dc.html` — the prototype: all seven steps plus the model panel.
  Open it in a browser. Its `<helmet>` block shows exactly which token files and
  which design-system bundle it loads.
- `support.js` — the prototype's streaming runtime. Design-tool infrastructure;
  do not port.
- `theme.js` — the theme resolver (auto/light/dark, localStorage key
  `auteur.theme`). Small, dependency-free, and worth porting as-is.
- `_ds/auteur-design-system-*/` — the design system consumed by the prototype:
  `tokens/*.css` (authoritative values), `styles.css` (the single entry point),
  `_ds_bundle.js` (the compiled component bundle).
- `design_system/readme.md` — the full design guide: the ink/paper rule, themes,
  colour, typography, spacing, borders, elevation, cards, radii, motion,
  interaction states, iconography and content fundamentals. Read this before
  making any visual decision the prototype does not cover.
- `design_system/components/` — source for the fifteen React primitives
  (`Button`, `Card`, `Badge`, `Icon`, `Field`, `Input`, `Select`, `Textarea`,
  `Markdown`, `Exemplar`, `Thinking`, `ProsodyStat`, `ProvenanceMark`,
  `WizardRail`, `ThemeToggle`), each with a `.d.ts` prop contract and a
  `.prompt.md` usage note. The first eight correspond to the PRD §12 inventory
  inherited from `packages/component-library`; the rest were added because the
  PRD names a UI requirement with no component to render it.
- `PRD.md` — auteur PRD draft v0.1, verbatim.
