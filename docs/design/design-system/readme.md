# auteur — design system

**auteur** gives a story generator one differentiator: the style is extracted
from evidence, not recalled from the model's vague impression of a name. You
give it an idea and an author; it fetches that author's public-domain corpus,
measures it, builds an inspectable **style card**, asks you questions generated
*from that card*, and drafts a story it then scores against the corpus.

That premise dictates the entire visual system. Two things are on screen at all
times, and they must never be confused:

- **The instrument** — the app: measurements, stage ids, tiers, provenance
  marks, costs. Dark prussian-cast ink ground, Archivo for chrome, IBM Plex
  Mono for anything numeric.
- **The artifact** — the prose: the story, the outline, verbatim exemplars.
  Warm cream paper, EB Garamond, a real drop shadow, book-style paragraph
  indents.

If a design puts generated prose on the dark ground, or a prosody number on
cream, it is wrong.

## Sources this system was built from

| Source | Access | What was taken |
|---|---|---|
| `uploads/PRD-2.md` — *auteur PRD, draft v0.1* | Provided in this project | Product concept, the seven-step wizard (§6), the `StyleCard` schema (§5), the pipeline stage/tier tables (§7), the style-fit report (§10), and the component inventory (§12) |

**Nothing else was supplied.** No codebase, no repository, no Figma file, no
screenshots, no font binaries, no brand guidelines. Every colour,
typeface, spacing value and layout in this system is therefore an original
proposal derived from the PRD — not a recreation of an existing product. Treat
it as a first draft of auteur's identity, and expect to override it once real
brand material exists.

Two consequences worth stating plainly:

- **The mark is set, not drawn.** No logo came with the PRD. A mark was made to
  a later request from the user: a capital **A in Great Vibes**, chosen from
  four script faces in `guidelines/brand-mark-options.html`. A script capital
  carries thick/thin contrast that hand-authored bezier paths do not, so the
  mark is a glyph — `--font-script`, one letter, never used for copy. It may
  stand alone where the lockup will not fit (favicon, app icon, loading state,
  avatar) and nowhere else; below 30px set the name in roman throughout. In the
  lockup **the mark is the word's own A** — script capital, then `uteur` in EB
  Garamond, baselines aligned, kerned tight, never a script A beside a roman
  one. Consequence worth
  knowing: `assets/logo.svg` is live `<text>`, so it is correct only when
  inlined in a page that has the webfont — **an outline export is outstanding**,
  and the steps are in the file's own comment. See
  `guidelines/brand-mark.card.html` and `brand-wordmark.card.html`.
- **The fonts are Google Fonts substitutions**, because no binaries were
  supplied. See *Typography* below.

The PRD's §12 lists a `packages/component-library` from a sibling project
(*argo-browser*) whose `Button / Card / Field / Input / Select / Textarea /
Markdown / Thinking` components auteur inherits. That repository was **not
provided**, so those eight components are implemented here from their names and
their role in the PRD — not copied. If argo-browser can be attached, they
should be re-derived from its real source and this system updated.

---

## Index

Root manifest:

| File | What it is |
|---|---|
| `readme.md` | This file — the design guide |
| `SKILL.md` | Agent Skills front-matter, for use outside this project |
| `styles.css` | The single entry point consumers link. `@import` lines only |
| `thumbnail.html` | Homepage tile |
| `tokens/` | `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `base.css`, `theme-light.css` |
| `guidelines/` | 26 foundation specimen cards (Colors, Type, Spacing, Brand, Content), including the mark and type-pairing option sheets |
| `components/` | 15 React primitives in 5 groups |
| `ui_kits/auteur-web/` | The seven-step wizard, click-through |
| `assets/` | The mark in three colour variants, plus `theme.js` (the theme resolver) |

Components (`window.AuteurDesignSystem_11e1bd`):

| Group | Components |
|---|---|
| `components/core/` | `Button`, `Card` (+`CardHeader`), `Badge`, `Icon` |
| `components/forms/` | `Field`, `Input`, `Select`, `Textarea` |
| `components/prose/` | `Markdown`, `Exemplar` |
| `components/pipeline/` | `Thinking`, `ProsodyStat`, `ProvenanceMark`, `WizardRail` |

The first eight are the PRD §12 inventory. **Intentional additions**, each
because the PRD names a UI requirement with no component to render it:

- `Icon` — a glyph wrapper, so no screen hand-rolls SVG.
- `Badge` — §6 and §8 require tier badges on author results and stages.
- `ProsodyStat` — §5's computed prosody block and §10's style-fit report are
  both tables of measurement-against-band; nothing else renders them.
- `ProvenanceMark` — §5 makes per-field `derived | edited` provenance a schema
  guarantee and requires the UI to mark it.
- `Exemplar` — §5's exemplars are "selectable, never editable" verbatim
  quotations with citations; that behaviour needs a component that cannot be
  edited.
- `WizardRail` — §6 requires seven steps, all re-enterable.
- `ThemeToggle` — not in the PRD at all. Added with the light theme at the
  user's request, since a two-theme system needs one control and one place the
  choice is stored. Pairs with `assets/theme.js`.

UI kits:

| Kit | Surface | Screens |
|---|---|---|
| `ui_kits/auteur-web/` | `apps/auteur-web` — the whole v1 product | Idea, Author, Research + style card, Questions, Outline, Draft, Result |

There is no marketing site, docs site, or mobile app in v1 scope (§4: "Accounts,
sharing, multi-user, hosting" are out; it runs locally), so this is the only
kit. No slide template was supplied, so no sample slides were built.

---

## Content fundamentals

auteur's copy sounds like a well-read person who has actually measured
something. It is precise, unhurried, and slightly dry. It never sells.

**Person.** The app addresses the user as *you*; it refers to itself in the
third person or not at all. "Answer them, or skip and the model chooses." Never
"we", never "I", never "Let's".

**Casing.** Sentence case everywhere — headings, buttons, labels, table
headers. The wordmark is lowercase `auteur` in every position. Uppercase is
reserved for eyebrows and provenance marks, always with `--tracking-caps`.

**Machinery is named honestly.** Stage ids, schema paths and tiers appear in
the interface verbatim and in mono: `style-extract`, `voice.narratorDistance`,
`sequential-scene`, `balanced`. The user is trusted to want to know. The app
does not hide behind "Analyzing…".

**Numbers carry their own argument.** Where a generic app would say "good style
match", auteur says the thing itself:

> Mean sentence length is 31.2 words against a corpus median of 21.0 with p90
> at 44 — you have the ceiling but not the floor. The corpus alternates long
> periodic sentences with sentences under eight words; the draft has three such
> sentences in 940.

**Questions state their purpose.** Per §6, a clarifying question that cannot
name the decision it resolves is not asked. Every question in the UI is
accompanied by a *Why asked* line:

> **Should the story present itself as a review of a book that does not exist?**
> Why asked — the corpus opens in this frame in 6 of 12 works; the idea does
> not specify a frame.

**Never block, and say so.** Skip affordances are labelled in plain words:
"You decide", "Generate now", "Skipping is never blocked." The result screen
shows a decisions log listing what the model chose on the user's behalf,
labelled `model chose — question skipped`.

**Degradation is honest.** Where the product is weaker, the copy says which
part and why: "A `secondary` card is built from interviews and criticism, has
no computed prosody and no verbatim exemplars, and gets a lower confidence."

**Legal labelling is not fine print but it is not shouted either.** Every
export and every story view carries one line in the paper's muted ink:
"Generated by auteur in the style of Jorge Luis Borges. AI-generated text; not
written by the author."

**No emoji. Ever.** Not in UI, not in copy, not in docs. Status is carried by a
coloured dot, a Lucide glyph, or a word. Exclamation marks are similarly absent
— the one place `!` appears in this system is the punctuation-frequency table.

**Words we use:** corpus, evidence, measured, derived, exemplar, beat, drift,
provenance, band, tier, stage, re-enterable.
**Words we avoid:** AI-powered, magic, effortless, seamless, unleash, craft (as
a verb), "in seconds", "just".

---

## Visual foundations

### The structural rule

Ink for the instrument, paper for the artifact. Nothing else in this system is
as load-bearing. See `guidelines/brand-ink-paper.card.html`.

### Themes

Two, and the second is not an inversion. **Dark is the instrument**: ink
chrome, prose inset on paper panels, measurement in prussian and laurel over
near-black. **Light is the artifact**: `data-theme="light"` re-points the
semantic aliases onto the paper ramp, so the whole surface becomes the cream
the prose was already printed on, and the ink/paper distinction collapses on
purpose — prose panels then separate by shadow and hairline rather than by
ground. Accents darken a step (prussian-600/700, amber-600, laurel-600) to hold
4.5:1 on cream; shadows drop to a tenth opacity.

Only `tokens/theme-light.css` differs between themes, and it touches nothing
but semantic aliases — the ink, paper and prussian ramps are identical in both.
That is the rule to keep: **if a component reaches past an alias to a ramp
value, it will not theme.** Six such reaches were removed when light mode
landed, in favour of `--track`, `--dot-pending`, `--border-danger`,
`--danger-quiet`, `--accent-quiet-hover` and `--link-underline`.

Default is `auto`, resolved by local clock: light from 06:00 to 18:00, dark
otherwise, re-checked every minute so a session left open crosses over on its
own. An explicit choice is stored in `localStorage` under `auteur.theme`
(`auto | light | dark`) and wins from then on. `assets/theme.js` must load in
`<head>` before first paint; `ThemeToggle` in the rail footer is the only
control. Cards in the Design System tab are pinned dark except
`colors-light.card.html`, which is pinned light.

### Color

The ink ramp is a single hue (oklch hue 250, chroma ≤0.018) so it reads as
neutral but sits cool and slightly blue — the colour of a good reading lamp's
shadow, not of a code editor's "midnight" theme. The paper ramp is the same
lightness discipline in warm yellow (hue 84–86).

**Prussian blue is the only accent.** Primary buttons, focus rings, links,
selected states, `derived` provenance, the `balanced` tier, the streaming
caret. One accent, used constantly, is the entire chromatic identity.

Three semantic hues, each with a dark tint for ink-ground fills:

- **Laurel** — `measured`, `pass`, `full-text` provenance.
- **Amber** — `edited`, `drift`, and the `strong` model tier (the tier that
  costs money is the same colour as the field the user overrode: both mean
  "attention here").
- **Oxblood** — failure, destructive actions.

No other hues. No gradients anywhere — not in backgrounds, not in buttons, not
behind headings. The only multi-stop colour in the system is the protection
gradient (below), and it fades a surface colour to its own transparent.

### Typography

Three faces, one job each — `guidelines/type-pairing.card.html` — plus one
script face reserved for the mark. The user chose pairing **B, antiquarian**,
from `guidelines/type-options.html`, which keeps the three original sheets
side by side for comparison.

| Face | Role | Never |
|---|---|---|
| **EB Garamond** (regular only) | Story prose, exemplars, titles, wordmark, question text | On a button or a number |
| **Archivo** (400/500/600) | All chrome: labels, buttons, hints, body copy | Story text |
| **IBM Plex Mono** (400) | Numbers, stage ids, schema paths, versions, elapsed times | Uppercase, or as body copy |
| **Great Vibes** (400) | The mark's A, and nothing else | Any copy, ever — not a heading, not a pull quote |

Prose is 19px at 1.72 leading, capped at 66ch, with a 1.4em first-line indent
on every paragraph after the first — book setting, not web setting. UI body is
15px at 1.45. The display scale tops out at 48px inside the app; only the
homepage tile goes larger.

EB Garamond sets optically small, so prose has its own size step,
`--text-prose: 19px`, rather than sharing `--text-md` with the sans. That is
the one place the scale forks by family: **if you swap the serif, re-check that
number.** Garamond's low x-height is also why prose stays on paper grounds — at
400 weight on near-black it goes thin.

**Font substitution — still open.** No binaries were supplied, so
`tokens/fonts.css` loads all four from the Google Fonts CDN. EB Garamond, IBM
Plex Mono and Great Vibes are open-licence (OFL) and available as real files;
Archivo was chosen as the grotesque because it is neutral, has a proper 600, and
is narrow enough for dense chrome. **If auteur has actual licensed faces, send
the files and this is a one-file change.**

### Spacing and layout

4px base scale; 2px and 6px exist for dense chrome (badge padding, stat gaps).
Fixed chrome is exact and should not be renegotiated per screen: rail 236px,
topbar 52px, screen gutter 40px, controls 28/34/42px, footer 64px.

Layout is a fixed left rail plus one scrolling column, and content columns are
declared explicitly — `minmax(0,1fr)` plus a fixed aside of 260–320px. The
aside is where measurement lives; the main column is where the artifact lives.
Asides on the draft screen are `position: sticky`.

### Backgrounds

Flat colour. No images, no photography, no illustration, no repeating
patterns, no textures, no noise, no grain. The paper surface is a flat cream
fill plus a shadow — it is *not* a paper texture image. If a screen feels
empty, the answer is whitespace and a hairline, never an ornament.

### Borders, rules and hairlines

Borders are the primary structural device, since there are no gradients and few
shadows. All ink-ground lines are white at low alpha: 10% hairline, 16% subtle,
28% strong. On paper, lines are black at 14%. Section labels sit above a
hairline with `--space-2` of breathing room below the text.

Three rule weights: 1px (structure), 2px (active tab, quote bar, wizard's
current step), 3px (a card's status accent along its top edge only).

### Elevation and shadows

On ink, elevation reads as a lighter hairline plus a soft dark shadow —
`--shadow-card` is barely visible and that is correct. On paper it is a real
two-layer drop shadow (`--shadow-paper`): a printed sheet lying on a desk. Only
popovers and modals get large blurs. No inner shadows anywhere except
`--shadow-inset-hairline`, a 6% top highlight available for raised chrome.

### Cards

- **Ink card:** `--surface-card`, 1px 10% hairline, 8px radius, 20px padding,
  `--shadow-card`.
- **Panel:** `--surface-panel`, same hairline, 12px radius, 24px padding, no
  shadow — a region, not an object.
- **Outline:** transparent with a 16% border — used for choices (author
  results, the follow-up-round prompt). Hover lightens the ground; selected
  swaps the border to prussian and the ground to `--surface-selected`.
- **Paper:** cream, **no border**, 2px radius, `--shadow-paper`, 24–56px
  padding depending on how much prose it holds.

Status is carried by a 3px top rule (`accent` prop), never by a coloured
left border.

### Corner radii

2px paper · 3px badges · 5px controls · 8px cards · 12px panels · 16px max.
`--radius-round` is reserved for status dots and radio marks. Nothing else is
a pill; nothing is a circle but a dot.

### Transparency and blur

Used in exactly three places: the modal scrim (72% ink + 6px blur), the
protection gradients over streaming prose (`--fade-ink-bottom`,
`--fade-paper-bottom`), and low-alpha borders. No frosted panels, no
translucent cards, no blurred nav bars.

### Motion

Short, eased, no bounce. `--dur-fast` 130ms for control state changes,
`--dur-base` 200ms for entrances, `--dur-slow` 340ms for the style-card reveal.
Easing is `--ease-out` `cubic-bezier(0.16,0.84,0.44,1)` — nothing overshoots.

Four named animations, and no others: `auteur-spin` (button spinner),
`auteur-pulse` (running stage dot, 1.3s), `auteur-caret` (streaming prose
caret, 1s steps), `auteur-fade-up` (a new streamed detail line, 4px rise).
Prose fades in; chrome slides 2–4px at most. Nothing slides across the screen,
nothing scales, nothing springs.

### Interaction states

| State | Treatment |
|---|---|
| Hover (filled) | One step lighter (`--accent-hover`), 130ms |
| Hover (ghost/outline) | Ground goes to `--surface-hover`, text brightens one step |
| Hover (paper) | 1px lift, shadow unchanged |
| Press | One step darker plus `translateY(1px)` — never a scale |
| Focus | 1px prussian border **plus** a 3px `--accent-quiet` halo; never a browser outline. On a bare ground, `--ring-focus` (2px ground gap + 4px prussian) |
| Selected | Prussian border and `--surface-selected` ground |
| Disabled | `opacity: 0.42`, `cursor: not-allowed`, no colour change |
| Running | Pulsing prussian dot; text stays at `--text-body` |

### Imagery

There is none. auteur ships no photography and no illustration; the corpus is
text and the output is text. If a future surface needs imagery, the honest
choice is a scan of a real public-domain page — warm, high-contrast, greyscale
— never a stock photo and never a generated image. Nothing in this system
should be filled with decorative artwork to make a layout feel finished.

---

## Iconography

**Lucide**, loaded per-icon from the `lucide-static` CDN and applied as a CSS
mask so every glyph inherits `currentColor`. No icon font, no sprite sheet, no
inline SVG in screens, and **no icons committed to `assets/`** — the set is CDN
available, so there was nothing to copy in.

- **This is a substitution and is flagged as such.** No icon set was specified
  in the PRD. Lucide was chosen for its 1.5px stroke, square-ish terminals and
  24px grid, which sit correctly next to Archivo. If auteur standardises on
  something else (Phosphor, Radix, a bespoke set), swap the URL in
  `components/core/Icon.jsx` — it is the only place icons are constructed.
- **Always via `<Icon name="…" />`.** Never a raw `<svg>` in a screen or slide.
  `Select`'s caret is the one exception, masked inline because it must sit
  inside a native control.
- **Sizes: 14, 16, 20.** 14 in dense chrome and inside buttons, 16 default, 20
  in section headers. Nothing larger — auteur has no illustrative iconography
  and no icon ever anchors a layout.
- **Colour comes from the parent.** Icons are never coloured directly; they
  inherit, so a status colour set on the wrapper carries through.
- **The working set** is small and repeats: `search`, `arrow-right`,
  `arrow-left`, `check`, `minus`, `refresh-cw`, `download`, `git-branch`,
  `trending-up`, `chevron-down`. See `guidelines/brand-icons.card.html`.
- **No emoji, ever**, and no unicode characters as icons — no `✓`, `→`, `•`,
  `★`. Status is a Lucide glyph, a coloured dot, or a word. The one non-Lucide
  glyph in the system is the 5px rotated square in `ProvenanceMark`, which is a
  shape, not a character.

`assets/` therefore holds no icon files. It holds the mark (three colour
variants) and `theme.js`; see `assets/README.md`. The mark is drawn in the
same stroke language as the icon set — 3.2 units on a 64 grid, round caps, no
fill — so it reads as the largest member of the same family rather than as a
separate piece of art.
