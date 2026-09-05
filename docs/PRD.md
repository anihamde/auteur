# auteur — PRD (draft v0.1)

Status: draft for review. Decisions marked **[open]** need your call; everything
else is decided and will be built as written unless you say otherwise.

## 1. What it is

Give auteur an idea and an author. It researches that author's actual prose,
asks you a handful of clarifying questions shaped by both, and writes a short
story in that author's style.

One sentence of scope: **a story generator whose differentiator is that the
style is extracted from evidence, not recalled from the model's vague
impression of a name.**

## 2. The problem worth solving

`"Write a story about a lighthouse in the style of Hemingway"` already works in
any chat app. It produces pastiche: short sentences, some fishing, the word
"clean". It is vocabulary cosplay.

The gap is that a model asked to imitate an author reaches for the *reputation*
of the author — the two or three traits that made it into the summary of them
it absorbed — not the craft. It misses sentence-length variance, punctuation
habits, how dialogue is tagged, what the author refuses to do.

auteur closes that gap with three things a chat prompt cannot do:

1. **Real corpus.** Full public-domain texts, fetched and measured.
2. **A style card.** A structured, partly *computed* description of the
   author's craft — including deterministic prosody statistics — that the
   drafting model is given as data, and that a revision pass can check the
   draft against.
3. **A wizard whose questions come from the style card.** Not a generic form.
   For Borges the app asks whether the story should present itself as a review
   of a book that does not exist. For Chekhov it asks whose small humiliation
   this is. The questions are themselves evidence the app understands the
   author.

## 3. Users and the job

Primary: someone who reads seriously and wants to play — writers testing a
premise in a voice, teachers building examples, readers who want a Calvino
story about their commute.

The job: *"I have an idea and a voice in my head. Get me a story that actually
sounds like that voice, and ask me the questions I'd have wanted to be asked."*

Secondary and explicitly designed for: the style card itself is a legible
artifact. Some users will care about it more than the story.

## 4. v1 scope

### In

- Public-domain authors (Project Gutenberg via gutendex).
- Wizard: idea → author → research → clarifying questions → outline → draft →
  style revision → result.
- Multi-pass generation with per-stage model routing.
- Ramp Router as the model gateway; provider seam that accepts others.
- Story length up to ~5,000 words.
- Local persistence of sessions, style cards, and stories. Markdown export.
- Style-fit report on the finished story.

### Out (v1)

- Living / in-copyright authors. Designed for (§8), not built.
- Novels and novellas. 5,000 words is the cap.
- Accounts, sharing, multi-user, hosting. Single-user, runs locally.
- Fine-tuning or embedding-based retrieval. Style cards + selected exemplars
  fit in context; a vector store is unnecessary complexity at this size.
- Images, audio, illustration.
- Editing the finished story in-app beyond regenerating a section.

## 5. The style card

The central artifact. Built once per author, cached, versioned, inspectable.

```
StyleCard {
  author:      AuthorRef
  provenance:  "full-text" | "secondary"   // v1 always full-text
  confidence:  number
  sources:     Work[]                       // what it was built from

  // Computed deterministically from the corpus. No model involved.
  prosody: {
    sentenceLength:    { mean, median, p10, p90, stdev }
    paragraphLength:   { mean, median }
    punctuation:       { emDash, semicolon, colon, ellipsis, exclamation }  // per 1k words
    dialogueRatio:     number
    typeTokenRatio:    number
    latinateRatio:     number
    commonBigrams:     string[]
  }

  // Extracted by a model reading selected passages, cited back to them.
  voice:       { pov, tense, narratorDistance, freeIndirect, reliability }
  diction:     { register, concreteness, signatureLexicon[], avoidedRegisters[] }
  dialogue:    { tagConventions, dialectRendering, speechToNarrationBalance }
  structure:   { openingMoves[], closingMoves[], sceneVsSummary, typicalShapes[] }
  imagery:     { recurringImages[], motifs[], preoccupations[] }
  rhythm:      { devices[], repetitionHabits }
  antiPatterns: string[]     // what this author never does

  exemplars:   { text, work, demonstrates }[]   // 8-15 short verbatim passages
}
```

Why the computed half matters: it is cheap, deterministic, and *checkable*.
"Write like Hemingway" is unfalsifiable. "Your draft's mean sentence length is
24.1 words against a corpus median of 11.4 with p90 at 26 — you have the
variance but not the floor" is an instruction a revision pass can act on and a
report the user can read.

**[open]** Is the style card user-editable in v1, or read-only with a
regenerate button? Editable is better product and roughly a day more work.
Proposed: read-only in v1, editable in v1.1.

## 6. The wizard

Adaptive, streamed, resumable. Seven steps; only 1, 2 and 4 require input.

| # | Step | User does |
|---|---|---|
| 1 | **Idea** | Free text. Optional target length and any hard constraints. |
| 2 | **Author** | Search-as-you-type against the corpus index. Tier badge shown. Disambiguation when needed. |
| 3 | **Research** | Watches. Corpus selection and style-card build stream in. Card shown when done. |
| 4 | **Clarifying questions** | Answers 3–6 model-generated questions, each with suggested answers plus "you decide". Every question skippable. |
| 5 | **Outline** | Reviews a beat sheet. Approve, edit, or regenerate. |
| 6 | **Draft** | Watches prose stream. |
| 7 | **Result** | Reads the story and its style-fit report. Export, regenerate a section, or restart from any earlier step. |

Two rules the wizard must not break:

- **Never block on a question.** Skipping means the model chooses, and the
  choice is recorded in a decisions log shown on the result screen. A user
  who wants to hit enter five times gets a story.
- **Every step is re-enterable.** Changing an answer at step 4 invalidates
  steps 5–7 but keeps the style card. Changing the author invalidates
  everything but the idea.

## 7. Generation pipeline

Multi-pass, defined declaratively so that alternative pipelines — including
single-pass — are configuration rather than an engine change.

```
Pipeline = { id, name, stages: Stage[] }
Stage    = { id, role, tier, promptTemplate, outputSchema?, streams: boolean }
role     = research | question | outline | draft | revise | critique
tier     = cheap | balanced | strong
```

Default `multi-pass`:

| Stage | Role | Tier | Output |
|---|---|---|---|
| `corpus-select` | research | cheap | Which works, which passages |
| `style-extract` | research | balanced | Qualitative half of the style card |
| `clarify` | question | balanced | 3–6 questions with suggestions |
| `outline` | outline | balanced | Beat sheet |
| `draft` | draft | **strong** | The prose |
| `critique` | critique | cheap | Style-fit findings vs card + prosody |
| `revise` | revise | strong | Targeted revision |

`single-pass` — a later addition, no engine work — is one `draft` stage with
the style card inlined.

Tiers resolve to concrete model IDs at runtime from the router's model catalog
plus a config map, so the catalog is not hardcoded. The cost argument for
multi-provider lives here: research, question generation and critique run on
cheap open-weight models; only `draft` and `revise` pay for a strong model.

Target: **median story under $0.15** at default tiers.

## 8. Extensibility to living authors

Designed for now, built later. The seam is a corpus provider:

```
CorpusProvider {
  kind: "full-text" | "secondary"
  searchAuthors(query): AuthorRef[]
  fetchEvidence(author): Evidence[]     // passages or claims, each with a source
}
```

v1 ships `GutenbergCorpusProvider` (kind `full-text`). A future
`WebResearchCorpusProvider` (kind `secondary`) returns evidence drawn from
interviews, criticism and reviews rather than the prose itself.

The style-card builder consumes `Evidence[]`, not a corpus type, so it does not
change. What changes is what the card can carry: a `secondary` card has no
computed prosody block and no verbatim exemplars, gets a lower `confidence`,
and the UI says so plainly. That degradation is the honest one — we should not
pretend a card built from three interviews is the same object as one built from
900,000 words.

Author search unions across registered providers and badges each result by
tier, so the UI is already shaped for the second provider before it exists.

## 9. Legal and ethical position

- Style is not copyrightable; expression is. v1 ingests only public-domain
  texts, so quoting exemplars carries no exposure.
- Output is labeled AI-generated and "in the style of", never as by the author,
  in the UI and in every export.
- The v2 living-author tier will ingest **no** primary text — secondary sources
  and short quotations only. **[open]** Worth your review before that tier is
  built; it is the one part of this product with real legal texture.

## 10. Success criteria

| Measure | Target | How |
|---|---|---|
| **Style fidelity** | Output prosody within the corpus interquartile band on sentence length, punctuation rate, dialogue ratio, type-token ratio | Computed. Automatic, deterministic, runs on every story. |
| **Blind discrimination** | LLM judge picks the real passage over the generated one no more than 70% of the time | Held-out real passages vs generated. Tracked, not a v1 gate. |
| **Completion** | ≥70% of started sessions reach a finished story | Session telemetry, local. |
| **Time to draft** | Median under 4 minutes, idea to first prose token | Instrumented per stage. |
| **Cost** | Median story under $0.15 | Usage accounting from the router. |

The first is the one that keeps the project honest. It is cheap, it is
automatic, and it will fail loudly the first time a prompt change makes the
drafting model drift back toward generic AI prose.

## 11. Model provider — Ramp Router first

**Decision: Ramp Router as the primary gateway, behind a provider seam.**

The cost case is real but secondary — Ramp waives routing fees through the end
of 2026 and passes list-price inference through, where OpenRouter charges 5.5%
on credit purchases. The stronger reason is fit:

argo's `model-client-openai` is built on `client.responses.create` and already
exposes a `baseURL` override in its config. Ramp Router presents an OpenAI
**Responses**-compatible endpoint. The existing adapter is close to a drop-in.
OpenRouter's `/v1/responses` is in beta; its stable surface is Chat
Completions, which would mean writing a second adapter against a different
request shape.

What would have flipped this, and did not:

| | Ramp Router | OpenRouter |
|---|---|---|
| API shape | OpenAI Responses | Chat Completions (Responses beta) |
| Catalog | ~27 models — OpenAI, Anthropic, xAI, plus DeepSeek, Kimi, GLM, Qwen, Nvidia, Minimax via Fireworks | 400+ |
| Routing fee | 0% through 2026, unannounced after | 5.5% on credit purchase, no token markup |
| Availability | US only, invite-requested | Open |
| Fallback | Automatic on provider failure | Provider routing controls |
| Web search | Not offered | Built-in plugin |

OpenRouter's catalog depth and its web-search plugin are genuine advantages,
and the second one becomes relevant when the living-author tier needs research.
Neither is decisive for v1: the cheap open-weight models we need are all in
Ramp's catalog, and v1 does no web research.

Two risks, both accepted: Ramp's post-2026 pricing is unannounced, and it is
US-only and invite-gated. The provider seam is the mitigation — adding
OpenRouter is a second `ModelClient` factory and a config entry, not a
refactor. Direct Anthropic and OpenAI keys slot into the same seam.

## 12. Architecture

Bun + Turborepo monorepo, matching argo's conventions so ripped packages need
no rewriting.

**Taken from argo-browser:**

| From | Use |
|---|---|
| `packages/agent-loop/src/model-client.ts` | The `ModelClient` / `ModelDelta` / `StopReason` / `Usage` contract. Taken as a **contract only** — auteur's pipeline is deterministic stages, not an agentic tool loop, so the loop itself is not needed in v1. |
| `packages/model-client-openai` | Adapted into `model-client-router`: Responses API, `baseURL` at Ramp, plus structured-output support (`json_schema`) that the pipeline's typed stages need and argo's adapter does not have. |
| `packages/model-client-anthropic` | Kept for a direct-Anthropic fallback path. |
| `packages/component-library` | Panda preset and the `Button` / `Card` / `Field` / `Input` / `Select` / `Textarea` / `Markdown` / `Thinking` components. The largest single time saving — the wizard is mostly these. |
| Root `biome.json`, `turbo.json`, tsconfig, `dependency-min-age` | Toolchain, as-is. |

**Not taken:** `transport-ws` and `protocol-loop`. Auteur streams one
direction, server to client. SSE over Hono is sufficient and much less
machinery. Revisit only if the wizard grows bidirectional interruption.

**New:**

| Package | Responsibility |
|---|---|
| `corpus-gutenberg` | gutendex client, text fetch, Project Gutenberg header/footer stripping, work and passage selection |
| `style-card` | Zod schema, deterministic prosody metrics, model extraction, cache and versioning |
| `pipeline` | Stage graph, tier→model resolution, streaming, usage accounting |
| `model-client-router` | Ramp Router provider |
| `apps/auteur-server` | Hono, SQLite (`bun:sqlite`), SSE |
| `apps/auteur-web` | Vite + React wizard |

**[open]** Adopt argo's `AGENTS.md` guideline regime in auteur (mandatory TDD,
offensive error handling, Panda-only styling, discriminated-union conventions)?
Proposed yes — the ripped packages are written to it, and diverging means
rewriting them. It is a strict regime and it will slow early velocity.

**[open]** Persistence: SQLite via `bun:sqlite`. Proposed yes over
in-memory-plus-export, because style cards are expensive to build and worth
caching across sessions, and a half-finished wizard should survive a reload.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Output is competent but not *identifiably* the author | The style-fit measure catches drift automatically. The exemplar passages in-context are the main lever if it does. |
| Style card overfits to one work | Corpus selection samples across career period and form; the card records which works it drew on. |
| Long corpora blow the context budget | Passage selection, not whole texts. Prosody is computed outside the model, on full text, for free. |
| Ramp pricing after 2026 | Provider seam; OpenRouter is a config entry away. |
| Wizard feels like a form | Questions are generated from the style card, not templated. If they read generic, that stage's prompt is the bug. |

## 14. Build order

1. Monorepo skeleton, argo packages ported, toolchain green.
2. `model-client-router` against Ramp, streaming and structured output, with an
   integration spike hitting the real endpoint.
3. `corpus-gutenberg`: author search, work fetch, cleaning.
4. `style-card`: prosody metrics first (deterministic, testable), then
   extraction.
5. `pipeline` engine with the multi-pass definition.
6. Server: sessions, SSE, SQLite.
7. Wizard UI.
8. Style-fit report and export.

Steps 3 and 4 are the ones that make the product; steps 1 and 2 are plumbing
and should not absorb more than they need.
