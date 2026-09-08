# 0007 — Six stages produce an output with nowhere to put it

**Status:** accepted · **Date:** 2026-09-08 · **Work package:** WP-N11

## Context

`artifacts.kind` admits `outline`, `draft`, `report` and `decisions` — the four
documents the result screen reads. Decision 0006 dealt with the *keys* of the
six stages that produce none of them. It did not deal with their **outputs**,
because at the time no stage body existed to produce one.

Writing the stage bodies makes the gap concrete:

| Stage | Produces | Where it went |
|---|---|---|
| `corpus-select` | the work ids to fetch, and why each | nowhere |
| `work-fetch` | rows in `works` and `passages` | its own tables |
| `prosody-compute` | the measured prosody over the corpus | nowhere |
| `style-extract` | a row in `style_cards` | its own table |
| `clarify` | rows in `questions` | its own table |
| `critique` | findings the `revise` stage consumes | nowhere |

Three stages have nowhere to write, and one of them — `corpus-select` — is the
first stage of every run.

## Decision

Add a nullable `output jsonb` column to `stage_keys`, written by the same
statement that records the key.

The column is nullable because a stage that writes its output to its own table
has nothing to put there, and a stage that has completed is a stage that has a
key. Making the output required would mean inventing a value for `work-fetch`.

## What was rejected

**Widening `artifacts.kind` to ten values.** Rejected for the same reason as in
decision 0006: `artifacts` would then mean both "the document this stage
produced" and "whatever this stage produced", and every reader of the four
document kinds would have to know which it was holding. The four are read as
documents throughout the codebase — by the session view, the export, the report.

**A separate `stage_outputs` table.** It would have the same primary key as
`stage_keys` and be written in the same transaction by the same code, which is
the definition of a column rather than a table. Two tables would also make it
possible to record a completion without its output, which is exactly the state
the single statement rules out.

## Consequences

- Migration `0004_stage_output.sql`, additive: one nullable column.
- `recordStageKey` takes an optional `output`, and `readStageOutput` reads it
  back parsed against the schema its stage declares.
- A stage's completion and its output are one write. A stage that completed
  without recording what it produced cannot exist, and that state would have
  presented as a downstream stage failing to find inputs from a stage the queue
  says succeeded.
