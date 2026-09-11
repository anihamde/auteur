# 0032 — The stages run on a worker

**Status:** accepted · **Date:** 2026-09-11 · **Work package:** deploy readiness

## Context

`style-extract` timed out on the deployment. It was split into `style-fields`
and `style-extract` (decision 0031) so each half would fit in one invocation.
`verify:live` then measured both, against **nine short passages** where the
deployment sends twenty:

```
style-fields:   41.3s, 3,602 in, 3,906 out
style-extract:  45.5s, 3,930 in, 1,323 out
```

**The split made it worse.** One call had been about sixty seconds; two are
eighty-seven, and neither is comfortably under the ceiling. And the shape of the
numbers says splitting further will not help: `style-extract` produced a third
of the output and took longer, so the cost is not proportional to what is
generated — the exemplars pass reads every passage and every reading before it
chooses. A third pass would add another forty seconds rather than divide one.

The deployment then timed out again with both stages in place.

The sixty seconds is the Vercel Hobby plan's. Everything below exists because of
it, and none of it is about the pipeline:

- `stage_queue` driven by the deployment invoking **itself** over HTTP
- `AUTEUR_STAGE_SECRET` and an HMAC, so that self-call cannot be forged
- `waitUntil`, and the defect where it held every caller for its successor's
  whole run (#83)
- a Deployment Protection bypass, because the deployment could not reach its own
  hostname (#79)
- a traffic-driven sweep, and a daily cron because Hobby refuses a per-minute one
- `MAX_DURATION`, `INVOCATION_CEILING_SECONDS`, and a stale-claim threshold
  derived from them (#82)
- the 0031 split itself

Seven of the nine defects found in one evening of deployment debugging were in
that list rather than in the product.

## Decision

**The stages run on a long-lived worker; everything a browser touches stays
serverless.**

- **Fly** runs one process. It claims the oldest queued row, runs the stage,
  records the key, enqueues the successors, and claims the next. A stage may
  take as long as it takes.
- **Vercel** keeps the client, `/api/*`, the SSE stream, and the two routes that
  *enqueue* — `advance` and `select-author`. Those answer a browser in
  milliseconds, which is the shape a function is right for.
- **The join is `stage_queue`.** Vercel enqueues, Fly drains, both talk to the
  same Neon database, and neither calls the other. That was already the
  contract; it stops being a workaround and goes back to being a queue.

`runClaimedStage` is shared: the worker and `POST /api/internal/stage` run an
already-claimed row through one implementation, because "record the key in the
same breath as the completion" is not a rule worth having two copies of.

`claimNext` uses `FOR UPDATE SKIP LOCKED`, so a second worker takes the second
row rather than contending for the first. Claiming stays conditional, so a
worker and a person with curl cannot run one row twice.

**`POST /api/internal/stage` stays.** Running one stage by hand is how every
stage in this product was first run, and it is what turned three of this
evening's failures from guesses into measurements. Nothing calls it
automatically.

## Consequences

- **Deleted from the serverless path:** self-invocation, `waitUntil`, the
  protection-bypass header, `selfOrigin`. The sweep keeps working and its
  invoker is now optional — a re-queued row is claimed on the worker's next tick.
- **The stale-claim threshold is no longer derived from the invocation ceiling.**
  Nothing is bounded by one. It is ten minutes: a judgement about how long a
  claim is evidence of a dead worker rather than a working one, far above the
  slowest measured stage and far below a reader's patience.
- **Two deploy surfaces.** This is the real cost. A change to a stage body ships
  to Fly; a change to a route ships to Vercel; a change to `packages/` ships to
  both, and they can be out of step. The alternative was one surface with a
  ceiling the product does not fit inside.
- **0031's split is no longer needed** and is not reverted here. It costs an
  extra model call and an extra read of the corpus for nothing now, which is a
  separate change with its own measurement to take.
- **A worker is always running.** A serverless deployment costs nothing when
  idle; this costs a few dollars a month whether anyone is writing or not. At
  the smallest machine that is the cheaper half of the comparison with a plan
  upgrade, and it is a real difference in kind.
