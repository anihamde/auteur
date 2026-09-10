# 0024 — The queue is a work list, not a history

**Status:** accepted · **Date:** 2026-09-10 · **Work package:** deploy readiness

## Context

A review of the catalogue migration found that restaling a stage does not run
it. Reproduced against Postgres, on a session shaped like a real one — the
corpus stages complete, the reader goes back and picks a different author:

```
POST /api/sessions/:id/author  →  {"enqueued":["corpus-select","work-fetch",
                                               "prosody-compute","style-extract"]}
SELECT stage_id, status FROM stage_queue WHERE session_id = …
  corpus-select  done
  work-fetch     done
  prosody-compute done
  style-extract  done
```

Four stages reported as enqueued and no queued row among them. The run then
continues against the previous author's corpus, and nothing anywhere says so.

`stage_queue` is `UNIQUE (session_id, stage_id, attempt)`, and a stage that has
run leaves an attempt-0 row behind. `enqueueStage` inserts at attempt 0 with
`ON CONFLICT … DO NOTHING`, so the second enqueue hit that row and did nothing.
The caller ignored the `undefined`, reported the stage as enqueued, and invoked
the queue id it had minted — which names no row, so the platform answered
`claimed: false` and the stage waited for a sweep that had nothing to find.

The unique key is not the mistake. It is what makes a stage's last act —
enqueuing its successors — idempotent when the invocation is retried after that
enqueue committed. Without it a retry runs the next stage twice.

## Decision

**A stage about to run again has its finished rows removed first.**
`retireFinished(db, sessionId, stageIds)` deletes the `done` and `error` rows
for those stages, and the enqueue that follows inserts a fresh attempt-0 row.
It is called from the three places that ask a stage to run again: the advance
and select-author path, `regenerate`, and the successor enqueue in
`/api/internal/stage` — the last because on a second run every successor still
carries the first run's finished row, so without it the chain stops one stage
in.

**`queued` and `claimed` rows are never retired.** A claimed row is an
invocation in flight, and deleting it would strand that invocation: its
`completeStage` would find nothing to complete, and the sweep would see no
stale claim to release because there would be no row at all.

**`enqueueStage` answers with the row that will run**, rather than `undefined`
on conflict. The caller's next act is to invoke a queue id, and a caller handed
nothing either skips the invocation or invokes the id it minted. Both leave the
stage sitting until a sweep. On conflict the existing row comes back and is the
one invoked.

**The queue holds no history, and this is what that means.** `stage_runs`
records what ran — the attempt, the model, the tokens, the cost — and is
untouched by any of this. `events` records what the reader was shown. Deleting
a finished queue row loses nothing anyone reads.

## What was rejected

**A partial unique index over live rows only.** `UNIQUE … WHERE status IN
('queued','claimed')` is the same guarantee with no delete. It needs a
migration that drops the existing constraint, and during the deploy window the
previous version's plain `ON CONFLICT (session_id, stage_id, attempt)` has no
non-partial index to infer and every enqueue raises. Expanding first does not
help: while both indexes exist, an insert the new code expects to conflict-and-
ignore violates the old constraint instead.

**Enqueuing at `max(attempt) + 1`.** It reuses a column that means something
else. `attempt` is §5.3's retry budget, and a re-run that starts at attempt 3
has no retries left.

## Consequences

- Restaling works, which the author-change path has always claimed to do.
- The queue for a session shows the current run, not every run. That was
  already how it read — nothing displayed it — and is now what it is.
- `enqueueStage` returns `QueueEntry` rather than `QueueEntry | undefined`, so
  no caller can drop the row.
