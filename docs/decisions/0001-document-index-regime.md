# 0001 — The document-index guideline regime

**Status:** accepted · **Date:** 2026-09-08 · **Work package:** WP-A4

## Context

`PRD.md` §12 left the guideline regime open. `ARCHITECTURE.md` §11.1 resolved it
toward nexus's **one-file** model: a single `AGENTS.md` carrying the rules in
compressed form, on the reasoning that argo's index "costs a re-read of several
documents per change".

That reasoning is not wrong, and the cost is real. What it undercounted is what
the compression costs on the other side: the rationale and the worked examples
do not survive it, and a rule without its reason is a rule that gets argued with
on every diff.

## Decision

auteur takes the **document-index** regime. The `local-app` profile is ported
into `docs/guidelines/`, and the root `AGENTS.md` is the generated index that
gives each document its authority level.

Three mechanisms come with it, and they are why the reversal is worth its cost:

- **`docs/guidelines/local/*.md` with `overrides:` front matter.** auteur
  deviates from three seeded documents — Phosphor becomes Lucide, `http-api`'s
  authenticate-and-authorize steps do not exist, `react`'s server components do
  not exist. In the one-file model each of those is an edit to the shared file.
  Here the seeded file is never edited, and the deviation is a document that
  names what it replaces.
- **`.agent-guidelines.lock`.** A refresh from upstream is a readable diff
  rather than an archaeology exercise, and a seeded file edited in place fails
  gate 10 — which is what routes a deviation to `local/` instead of into the
  seed.
- **Per-package addenda.** A guideline that is `if-touched` at the root is
  unconditional inside one package, and the package says so. A
  `component-library` change reads four promotions rather than re-deriving which
  of twenty-five apply.

## The cost, and what bounds it

Twenty-five seeded documents plus five local ones, against nexus's one file.

- **Tiers do the filtering.** Eleven seeded documents are ALWAYS, plus
  `local/invariants.md`. The other eighteen are `if-touched` or `reference`, and
  their triggers decide. A typical `packages/prosody` diff is in scope for the
  ALWAYS set and nothing else.
- **Most load-bearing rules are gates.** Fourteen CI gates enforce the half that
  matters. The documents explain; CI decides.

## What would reverse this

A contributor measurably skipping the post-edit audit — the compressed one-file
version is the fallback, and `.agent-guidelines.lock` makes it recoverable
because it records exactly what was seeded and from which commit.

## Consequences

- `ARCHITECTURE.md` §11.1 and §12's open-item row are amended to state this
  regime and point here.
- Every PR carries a "Guidelines audited" line. A PR without it is incomplete.
- `data-boundaries` is promoted repository-wide by `local/invariants.md`: its
  trigger fires on nearly every diff in a product that is seven model calls and
  two HTTP clients, and a trigger that fires on almost everything is one nobody
  evaluates honestly.
