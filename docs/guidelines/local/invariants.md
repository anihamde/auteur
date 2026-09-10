---
id: invariants
title: The four invariants
covers: What auteur is, expressed as rules that decide ambiguous cases
tier: always
---

# The four invariants

`docs/ARCHITECTURE.md` §0. They are here rather than only there because they are
the tiebreak: when a design question has two defensible answers, take the one
that keeps these true. That is not a slogan — three of the four have already
decided a real question in this repository, and each is noted below.

## 1. A measurement is never an opinion

Prosody is computed from full texts by code, not asked of a model. A number the
product shows is one it calculated, and the card's prosody block is immutable.

*Decided:* `prosody` returns `undefined` rather than `0` for a dialogue ratio it
could not measure. Zero is a measurement; not having been able to measure is
not, and a reader cannot tell them apart once they are the same value.

## 2. Every claim carries its provenance

A qualitative field is a `Claim<T>` with an `origin` and — when `derived` — a
citation into `passages`. The card cannot hold a derived claim without the
passage it was read from.

*Decided:* `claimSchema` refuses a `derived` claim with no citation at the parse
boundary, so an uncited claim cannot be constructed rather than merely being
discouraged.

## 3. The wizard never blocks, and every step is re-enterable

Skipping a question is always allowed and always recorded. Re-entering a step
invalidates exactly what depends on what changed, and nothing else.

*Decided:* staleness is a computed comparison of input keys, not a `stale`
column. A flag has to be set by whoever invalidates, which is seven `if`
statements and one of them wrong; a comparison cannot be forgotten.

## 4. A model's output is parsed, never trusted

Every model response goes through a schema. A stage that cannot parse its
output fails with `schema_violation` rather than proceeding with a shape it
guessed at.

*Decided:* `corpus-select` filters the model's chosen ids against the candidate
list it was offered, so a work nobody has is dropped at the stage that invented
it rather than becoming a 404 in `work-fetch` two minutes later. Parsing is not
only the schema: a value of the right *shape* naming a thing that does not exist
is still output that was trusted.

## `data-boundaries` is promoted to ALWAYS by this document

The seeded `data-boundaries` guideline is `if-touched`, and its trigger is "you
read external data … or you declare a schema that is sent to another system".

In this product that trigger fires on nearly every diff. auteur is seven model
calls and two HTTP clients; the pipeline's whole shape is *parse what came back*.
A trigger that fires on almost everything is a trigger nobody evaluates
honestly, so it is settled once here rather than re-decided per diff:
**`data-boundaries` is in scope for every change.**

That is a promotion, which is the only direction the precedence rules allow.
