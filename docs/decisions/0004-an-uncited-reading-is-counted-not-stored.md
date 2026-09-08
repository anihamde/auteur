# 0004 — An uncited reading is counted, not stored

**Status:** accepted · **Date:** 2026-09-08 · **Work package:** WP-K1

## Context

`docs/IMPLEMENTATION-PLAN.md` §6 wave K says of the card builder: *"a derived
field the model returned without a citation is stored uncited rather than
dropped, and `confidence` reflects it."*

That is not buildable. `claimSchema` — merged at WP-B6, and written directly
from `ARCHITECTURE.md` §0 invariant 2 — refuses a `derived` claim with no
citation at the parse boundary:

```
a derived claim must cite the passage it was read from (invariant 2)
```

So there is no shape the assembler can produce that carries an uncited derived
claim. One of the two has to give.

## Decision

**The invariant wins.** An uncited field is not written to the card. It is
counted in `cardStrength.derivedFields` — every derived field the extraction
*attempted* — while `citedDerivedFields` counts the ones it could support, and
`confidence` is the ratio of the two.

The plan's intent is kept exactly: the gap is visible, and it is visible in the
number the design already shows. What changes is where the unsupported reading
lives — in the denominator rather than on the card.

## Why not the other way

A card holding a claim with nothing behind it is what the provenance mechanism
exists to prevent. The failure is not that an unsupported reading is wrong — it
may well be right — it is that a reader cannot tell which readings are which
without opening every one. Invariant 2 is what makes the citation on a claim
mean something, and a card with two kinds of `derived` claim, one citable and
one not, makes the mark on the other twelve worth less.

The alternative reading — add a fourth `Origin` for an ungrounded reading —
was considered and is worse. It puts a new state in every switch over `Origin`
in the UI, the report and the export, to render a claim the product is not
confident enough to make.

## Consequence: a required field with no citation does not build a card

`voice.pov`, `diction.register` and the other twelve are required by
`styleCardSchema`. If the extraction cannot cite one, `buildCard` throws
`schema_violation` naming the field rather than shipping a card with a hole.

That is the correct failure. A card promises those fields; one that cannot keep
the promise is not a low-confidence card, it is not a card. The pipeline reports
it, and the retry is a rerun of the extraction rather than a repair of the
output.

## Consequences

- `confidence` counts from the **evidence list**, not from the assembled card.
  Counting from the card would make every card 1.00, because the uncited fields
  are exactly the ones that are not on it.
- Attempted paths are deduplicated: a model returning the same field twice
  attempted it once.
- `docs/IMPLEMENTATION-PLAN.md` §6 wave K's proof line is superseded by this
  file. The plan is not amended in place — it is the record of what was planned,
  and a decision is the record of what the code does instead.
