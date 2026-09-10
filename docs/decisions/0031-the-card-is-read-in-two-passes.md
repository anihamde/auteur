# 0031 — The card is read in two passes

**Status:** accepted · **Date:** 2026-09-10 · **Work package:** deploy readiness

## Context

`style-extract` timed out on the deployment, every time:

```
2026-09-10 23:01:37.885 [error] Vercel Runtime Timeout Error: Task timed out after 60 seconds
```

`verify:live` measured the same call against **nine short passages** and it took
about sixty seconds — while reporting `ok`, because the check had no opinion
about how long a pass took. A stage runs inside one invocation and the
deployment sends twenty passages of four to nine hundred words, so a probe
sitting at the ceiling on a fraction of the corpus is a stage already past it.

The invocation ceiling is 60 seconds because that is what the Vercel Hobby plan
allows. `build-vercel.ts` states the rule this follows and has since it was
written:

> It bounds one stage, not a run: the chain's whole design is that no invocation
> waits for another, so a stage that needs longer than a minute is a stage to
> split rather than a limit to raise.

**Which axis to split on is not obvious from the outside.** An output-bound call
splits by what it produces; an input-bound one by how many passages it reads,
and each extra pass re-reads the corpus, so splitting the wrong way multiplies
input cost for nothing. The probe was changed to report tokens and seconds
before anything was rewritten.

## Decision

One call returned twenty-two readings **and** eight to fifteen exemplars. Two
stages now:

- **`style-fields`** — the readings, each cited to a passage or explicitly not
  (decision 0030). Its output is the `fields` array.
- **`style-extract`** — the exemplars, and the card. It reads `style-fields`'
  output through `readStageOutput`, the same mechanism every other stage
  boundary uses, so the two are joined by the queue rather than by a function
  call that would put them back in one invocation.

`style-extract` names `style-fields` in `reads`, which is what makes §7.5
restale the exemplars when the readings change — the correct answer, and not one
anything codes.

**The exemplars pass is given the readings.** An exemplar says what a passage
demonstrates, and what it demonstrates is one of them; asking for exemplars
without them is asking for passages that are merely interesting.

**Both passes read the same twenty passages**, through one shared selector.
`style-extract` resolves an exemplar's id against that list and
`cardFromExtraction` resolves a field's citation against it, so two passes
seeing different sets would drop citations that were never wrong. It is
deterministic by construction — `listWorksByAuthor` orders by id,
`listPassagesForWork` by `char_start`, `spreadAcross` is pure — and shared so it
cannot become two implementations that agree by accident.

**`build_key` carries both prompt versions.** The card is read by two prompts
and a bump to either produces a different card; one version in the key would
serve a card whose readings came from a prompt nobody is using any more.

## Consequences

- **Eleven stages, not ten.** §6.2 names ten and the eleventh is a platform
  consequence rather than a design change. The research screen shows five rows:
  a row standing for two stages would sit at "running" through a stage that had
  already failed.
- **The corpus is read twice.** Two passes over the same twenty passages is
  roughly twice the input tokens of one. That is the price of the split, and it
  is why `spreadAcross` cut the passage count to twenty first (#92) — the two
  changes together are meant to land each pass around half a minute.
- **Neither pass is verified to fit yet.** `verify:live` now reports seconds per
  pass, against nine passages rather than twenty. If `style-fields` is still
  near the ceiling it splits again, by claim group, and the same measurement
  says so rather than a guess.
- **On a plan with a 300-second ceiling none of this would be necessary.** It is
  recorded because a future reader will find eleven stages where §6.2 names ten,
  and the reason is the plan and not the pipeline.
