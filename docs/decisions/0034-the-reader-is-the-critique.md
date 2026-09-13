# 0034 — The reader is the critique

**Status:** accepted · **Date:** 2026-09-13 · **Work package:** simplification

## Context

The pipeline had eleven stages. Four of them were about the prose:

```
outline → draft → critique → revise → style-fit
```

`draft` wrote the story. `critique` read it against the card and returned
findings. `revise` applied the findings and wrote the story again. `style-fit`
scored what came out. Two of those four are model calls the reader never asked
for, one of them at the strongest tier, and between them they produce a
judgement the reader is about to make anyway and can state in a sentence.

They were also the source of the last run's worst failures. `critique` and
`style-fit` were claimed the moment the stage they read finished, failed
`invalid_input` in 0.04 seconds against an upstream that had not run, and were
re-enqueued — every cycle, for the life of the session. `revise` ran at `strong`
against findings that a triage step had usually emptied.

And there was nothing a reader could say. The one input a person had was an
answer to a question the model wrote, which is closed by construction: the
question existed before the beat sheet did. A reader looking at a beat sheet
that started in the wrong place had two controls — "Regenerate", which rolls the
dice, and "Change model", which rolls different dice.

## Decision

**Nine stages, and the fourth prose stage is the reader.**

```
outline → story → style-fit
```

`story` writes the prose and rewrites it. One prompt, because a rewrite differs
from a first attempt in exactly one way: there is a story already, and there is
something the reader said about it. Both are inputs.

The screens are the loop:

- **outline** — the beat sheet, a note field, "Rewrite with these notes",
  "Approve and write the story".
- **story** — the prose, a note field, "Rewrite with these notes", "Approve the
  story".

**Approving is moving on.** There is no approval flag: a session on the `story`
step is a session whose outline was approved, which is one fact rather than two
that can disagree.

**A note is a direct input** (`_staleness.ts`), which is the whole of the
mechanism. Filing one changes the note set, which changes the stage's input key,
which is what `advance` reads — so `POST /notes` starts nothing, and the screen's
one press is two requests in an order that matters: the note, then the advance.
Reversed, the advance reads the note set as it was and finds nothing stale.

**Every note travels, oldest first.** "Shorter in the middle" and, later, "give
the ending more room", are two requests and not a replacement. A key built from
the last note alone, or from the count, would make the second press a no-op.

`regenerate` keeps its place and loses its shape: `{ stageId }`, where the stage
is one a reader reads. The `selection` kind is gone with `revise` — replacing one
span was `revise` with a span instead of findings, and a reader who wants the
middle cut now says so.

## Consequences

- **Two model calls fewer per story, one of them `strong`.** `story` is the only
  strong-tier stage; there were two.
- **`critique` and `style-fit` stop burning retries.** Nothing is enqueued ahead
  of the step that needs it (decision 0033), and the stage that failed every
  cycle no longer exists.
- **`story@1`, not `draft@3`.** A different prompt, not a new version of the old
  one. A session holding a `draft@2` key finds no stage answering to it, which is
  correct: the stage is gone.
- **The step is `story`.** `0009_story_step.sql` admits both and moves the
  sessions that were on `draft`; dropping `draft` from the CHECK is a later
  migration, after nothing writes it.
- **The artifact kind stays `draft`.** It is the row the prose lives in, parsed
  by `storySchema` and returned as `story`. Renaming it buys nothing the reader
  can see and costs a migration plus a dual-read path in the change whose point
  is that there is less to read.
- **The prosody drift aside stays on the story screen.** The reader's sentence
  replaced the *model's* judgement of the prose, not the measurement — the
  measurement is what this product is.
