# 0029 — A stage invocation outlives the response that asked for it

**Status:** accepted · **Date:** 2026-09-10 · **Work package:** deploy readiness

## Context

No stage this product has ever run was started by the product.

`corpus-select` ran once, correctly, and chained to `work-fetch` — which then
sat at `queued` with a null `claimed_at` for eighty minutes, across dozens of
requests to the deployment, past a sweep threshold of sixty seconds. Every
stage that had ever executed was one a person had invoked by hand with a signed
curl.

The Vercel log for the invocation showed **neither** of the two lines the
invocation can print:

```
stage invocation refused   — the request was made and answered
stage invocation failed    — the request went out and did not arrive
```

Both silences are the finding. The request was never dispatched.

```ts
void fetch(url, { … })
  .then(…)
  .catch(…);
```

A serverless instance is frozen the moment its response is written. The promise
was dropped, the handler returned, the instance froze, and the fetch never left.
Nothing was refused and nothing failed, because nothing happened.

**`_app.ts` states the rule this broke**, in a comment explaining why the
traffic sweep runs before the routes rather than after:

> Before the routes, because a serverless instance may be frozen the moment its
> response is written — work scheduled for afterwards is work that may never
> happen.

The sweep was placed correctly against that rule. The invocation was not — and
the sweep calls the same function, so it could not rescue what it shared.

Three things kept it invisible. `void` reads as deliberate and lints clean.
`entry.ts` is imported by nothing and, until this morning's tsconfig
correction, type-checked by nothing. And the failure presents as a slow
pipeline: rows accumulate, the sweep re-invokes into the same nothing, and no
log line is written to contradict the impression.

## Decision

**The dispatch is handed to `waitUntil`.** The platform's answer to exactly
this: keep the instance alive until the promise settles, without the response
waiting on it. `@vercel/functions` is the package that provides it.

**Not `await`.** The caller must return before the stage runs (§7.1) and
`/api/internal/stage` runs the stage inline, so awaiting would nest four
invocations into one call chain — each waiting on the next, the outermost past
`maxDuration`.

**`waitUntil` is injected, not imported at the call site.** `createInvokeStage`
takes it as a dependency, which is what makes "the promise is handed over"
assertable. Absent — a local `vite dev`, a test — the promise is left to a
runtime that does not freeze.

**The invocation moves out of `entry.ts`** into `_internal/invoke-stage.ts`.
A defect in the one module nothing imports and nothing covered is a defect with
no way to be caught; five tests now cover the dispatch, the signature over the
raw body, the bypass header, and the two log lines that distinguish a refusal
from a loss.

## What was rejected

**Streaming the internal route's headers early**, so an `await fetch(…)`
resolves on dispatch rather than on completion. It is dependency-free and it
works in principle, and it makes the chain depend on when a platform flushes
headers for a buffered Node response — a behaviour this repository cannot test
and would discover it had lost only by the pipeline stopping again.

**Letting the sweep carry the pipeline.** It advances one stage per sixty-second
window given traffic, turning a two-minute run into an afternoon. It is a
backstop for a lost invocation, which is what it stays.

## Consequences

- Picking an author starts a stage within a second, and the research screen
  fills in on its own rather than showing four rows that never move.
- The sweep is a backstop again rather than the only mechanism, and a mechanism
  that did not work.
- `@vercel/functions` is the first platform-specific runtime dependency. It is
  confined to `entry.ts`'s wiring; nothing under `packages/` imports it, and the
  function it provides is optional in the type that consumes it.
