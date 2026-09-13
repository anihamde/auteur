# 0033 — A stage never runs past the step the reader is on

**Status:** accepted · **Date:** 2026-09-13 · **Work package:** deploy readiness

## Context

From a real run, four lines apart in the worker's log:

```
23:04:28  clarify  finished  → enqueued outline
23:04:28  outline  running
23:05:21  outline  finished  → enqueued draft
23:05:21  draft    running
```

`clarify` wrote its questions and `outline` started in the same second. The
reader had not seen a question, let alone answered one. `outline` reads the
answer set through `priorAnswers`, found it empty, and built the beat sheet from
the idea and the card alone — and then the draft was built from that beat sheet.
The whole clarify step was theatre: the reader typed answers into a screen, and
nothing downstream ever read a word of them.

This was not a regression in `outline`. §7.1 says `advance` is the only route
that *starts* work, and on the serverless path that held by accident rather than
by rule: a finished stage enqueued every successor, exactly one invocation was
asked for, and the rest sat `queued` until the reader pressed a button. Decision
0032 replaced that with a worker that drains the queue. The accident ended and
nothing had ever stated the rule.

The same run showed the second half of the same defect in `runDraft`. It built
its prompt from the card directly:

```ts
exemplars: card.exemplars.map((exemplar) => ({
  demonstrates: exemplar.demonstrates,
  text: "",
  workTitle: exemplar.workTitle,
})),
targets: summariseCard(card),
```

A card's exemplar is a `passageId` and a sentence about what it demonstrates;
the passage itself lives in `passages`. So the prompt's exemplar section —
"Passages from the author's own work, verbatim" — was fifteen headings with
nothing under them, and its "Measured targets" section repeated the style-card
section word for word. On the one call this product exists to make, neither the
author's prose nor the numbers measured from it arrived.

## Decision

**The bound on what a finished stage may start is the step the session is on**,
and it is the same bound `enqueueStaleUpTo` already uses:

```ts
export const successorsWithin = (stageId: string, step: Step): string[] => {
  const limit = LAST_STAGE_FOR_STEP[step];
  if (limit === undefined) return [];
  const bound = STAGE_IDS.indexOf(limit);
  return successorsOf(stageId).filter((id) => {
    const at = STAGE_IDS.indexOf(id);
    return at !== -1 && at <= bound;
  });
};
```

`runClaimedStage` reads the session it has already loaded for the input key, so
this costs no query. Within a step the chain still runs unattended — fetching
leads to prosody leads to the readings — and at the edge of a step it stops.
Pressing the button is what moves the step, and moving the step is what releases
the next stage.

`advance` now moves the step **before** it enqueues, as `selectAuthor` already
did. Between the enqueue and the update there was a window in which a stage
could complete against the step the reader had just left, and stop the chain one
stage in.

**`runDraft` reads the passages it cites and the bands it will be scored
against.** `attachPassageText` resolves each exemplar's passage by id and drops
any whose passage is missing or empty — a heading with no body is not weaker
evidence, it is a claim with none. `targetBands` computes the corpus value and
band for each scored measure through the same `bandFor` over the same points
`measuresFor` uses, so the target the draft is given and the target the report
marks it against cannot come apart.

## Consequences

- **`draft@2`.** Not a change to the prompt's text but to what fills it, and the
  prompt version is what the draft's input key is built from — so bumping it is
  the only thing that restales a draft written against empty exemplars.
- **A session left on `idea` or `author` enqueues nothing**, because those steps
  need no stage. That was already `enqueueStaleUpTo`'s answer and is now the
  answer everywhere.
- **`critique` and `style-fit` stop burning retries.** They were claimed as soon
  as the stage they read finished, failed `invalid_input` in 0.04s against an
  upstream that had not run, and were re-enqueued. They are now enqueued only on
  the `result` step, by which point what they read exists.
- **Two places know the step bound and both read `LAST_STAGE_FOR_STEP`.** A step
  added to §3.2 without an entry there gates everything after it rather than
  nothing, which fails visibly on the first run.
