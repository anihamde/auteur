# 0030 — A claim about absence cannot cite a passage

**Status:** accepted · **Date:** 2026-09-10 · **Work package:** deploy readiness

## Context

`bun run verify:live`, asking a real model to satisfy the extraction contract
against nine passages:

```
FAIL a real model satisfies the extraction contract
       antiPatterns: Invalid input: expected object, received undefined
       diction.avoidedRegisters: Invalid input: expected object, received undefined
       ...
       returned 22 of 22 paths, 15 of them cited
       returned uncited: antiPatterns, diction.avoidedRegisters,
       diction.signatureLexicon, imagery.motifs, imagery.recurringImages,
       voice.pov, voice.tense
```

The model returned every path it was asked for. Seven carried no citation, and
the card did not build.

Three rules were in force and they cannot all hold:

1. `styleCardSchema` **requires all twenty-two claims**.
2. `claimSchema` refuses a `derived` claim with no citation (invariant 2).
3. `buildCard` therefore **drops** an uncited field, and decision 0004 counts it
   against `confidence` instead of storing it.

So a model that answers "I cannot point at a passage for this" produces no card
at all — and the prompt explicitly invited that answer, calling it "honest and
useful".

**Five of the seven cannot be cited by construction.** `antiPatterns` and
`diction.avoidedRegisters` are claims about *absence*: no passage exhibits what
an author does not do, and a citation would point at a passage that does not
contain the thing being claimed. `imagery.motifs`, `imagery.recurringImages`,
`diction.signatureLexicon` and `structure.typicalShapes` are claims about
*recurrence*: one passage can illustrate a motif and cannot establish that it
recurs.

Requiring a citation for those is requiring a fabrication, which is the one
thing invariant 2 exists to prevent. The rule was being applied to claims it was
never about.

## Decision

`CLAIM_PATHS` records, for each of the twenty-two, what can evidence it.

**`passage`** — a reading taken from one passage. Fifteen of them. It must cite
that passage; an uncited one is dropped exactly as before. Every one is visible
in a passage, so there is always one to point at. (`voice.pov` and `voice.tense`
were among the seven the model left uncited, and both are of this kind: the
prompt's fault for inviting null indiscriminately, not the model's judgement.)

**`corpus`** — an absence or a recurrence. Seven of them. It carries
`origin: "measured"` — read from the corpus as a whole, which is what it is —
and no citation, and it is written to the card. `claimSchema` already permits
this: its refinement binds `derived` alone.

**A citation offered for a corpus claim is not written.** `origin: "measured"`
says the reading came from the corpus; a passage citation beside it says it came
from one passage. Both cannot be true, and the citation is the half that is
wrong — one passage cannot establish an absence or a recurrence. A model that
sends one anyway is offering support the claim does not have, and writing it
would put on the card exactly the kind of citation invariant 2 is for.

`confidence` counts **neither**. Coverage answers "how much of what could be
cited was". A claim that cannot be cited belongs in no part of that ratio: in
the denominator it would cap every card below 1.00 for doing nothing wrong, and
in the numerator it would count evidence that does not exist.

The prompt lists the two groups separately and states the rule for each.
`style-extract@3`, because the prompt is in the build key.

## Consequences

- **Invariant 2 is narrower and unweakened.** Every claim that is *read from a
  passage* still cites it, and a card carrying one that does not still fails to
  build. What changed is that a claim about the corpus is no longer asked for a
  citation it could only invent.
- **`origin` earns its second value.** `measured` was already in the vocabulary
  and was used only for prosody. It now means the same thing for the qualitative
  half: read from the corpus rather than from a passage.
- **A reader can tell them apart.** The card carries `origin` on every claim, so
  "no citation here" is distinguishable from "citation missing here" without
  consulting this document.
- **Confidence becomes reachable.** The old ratio could not exceed 15/22 for a
  model behaving correctly. A card where every passage claim is cited now reads
  1.00, which is what it should have meant all along.
- **The classification is a judgement.** Seven paths were assigned by reading
  what each claim asserts. `style-card`'s tests hold the split against the card
  the assembler produces; a path moved between groups without moving in
  `CLAIM_PATHS` fails there.
