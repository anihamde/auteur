# 0006 — Staleness needs a per-stage key table

**Status:** accepted · **Date:** 2026-09-08 · **Work package:** WP-N4

## Context

`ARCHITECTURE.md` §7.5 defines staleness as a comparison:

> Every artifact stores the hash of the inputs it was produced from. An
> artifact is stale when that hash no longer matches.

`artifacts.input_key` implements that, and `artifacts.kind` admits four values:
`outline`, `draft`, `report`, `decisions`. The pipeline has ten stages.

Six of them — `corpus-select`, `work-fetch`, `prosody-compute`,
`style-extract`, `clarify` and `critique` — produce no artifact. Their outputs
land in `works`, `passages`, `style_cards` and `questions`, none of which is
keyed by session in the way the comparison needs. So for those six there is
nowhere to read the previous key from, and the comparison has only two possible
answers, both wrong:

- **Always stale.** Re-entering the outline step re-downloads a corpus and
  rebuilds a card. §7.5 exists to prevent exactly this.
- **Never stale.** Changing the author leaves `corpus-select`'s result in
  place, and the draft is written in the style of the previous author.

The architecture does not say which, because the gap is not visible until you
try to compute a key for a stage that does not write a document.

## Decision

Add `stage_keys (session_id, stage_id, input_key, completed_at)`, one row per
completed stage, written by the stage as its last act inside the same
transaction that records its output.

Staleness then reads one table for all ten stages: a stage is stale when the
key it would have now differs from the key stored for it, and a stage that has
never completed has no row and is stale by absence rather than by a comparison
against a sentinel.

`artifacts.input_key` stays. It is not redundant — it is what
`readFresh` compares in the same `WHERE` clause that fetches the body, which is
what keeps a caller from reading a row and forgetting to compare. The two agree
because the stage writes both from one value.

## What was rejected

**Widening `artifacts.kind` to ten values with empty bodies.** It would make
`artifacts` mean two things — "the document this stage produced" and "this
stage ran" — and the four kinds that do have bodies are read as documents all
over the codebase. A row whose `body` is `{}` is a lie the reader has to know
about.

**Deriving a key per stage from the tables it wrote.** `work-fetch`'s output is
rows in `works` shared across sessions; there is no per-session hash to
recompute, and inventing one means re-reading a corpus to decide whether to
re-read a corpus.

## Consequences

- One migration, `0003_stage_keys.sql`, additive.
- The staleness computation is uniform: no stage is a special case, which is
  the property §7.5 was after when it said "the consequences fall out rather
  than being coded".
- A stage that fails leaves no row, so it is stale on the next `advance` and is
  retried. That is the behaviour the queue's retry budget already assumes.
