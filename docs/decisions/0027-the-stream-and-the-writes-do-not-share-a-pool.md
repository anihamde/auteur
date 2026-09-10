# 0027 — The stream and the writes do not share a pool

**Status:** accepted · **Date:** 2026-09-10 · **Work package:** deploy readiness

## Context

Decision 0026 gave the transactional writes a direct handle, and gave them the
one the SSE route already had. A review measured what that costs.

The two use a connection differently. The SSE route **holds** one for the life
of a stream, because `LISTEN` is session-level and there is no other way to be
woken. A transactional write **borrows** one for a few milliseconds.

A direct pool defaults to four connections. Four open streams on one instance
therefore hold every connection in it, and the next `append` waits — and `pg`
waits for ever by default, so inside a serverless function it waits until
`maxDuration` kills the invocation. The stage's row is still `claimed`, its
event is unwritten, and the log says only that the function timed out.

Reproduced: with four `connect()` clients held, `transaction(...)` on the same
handle never resolves.

## Decision

**Two direct handles.** `directDb` for the writes that must be atomic,
`streamDb` for the subscription. Each is bounded by what it is for, and neither
starves the other. A stream that cannot get a connection is one screen that
reconnects; a write that cannot is a stage that fails and is retried.

**A direct handle is held, never borrowed from.** Splitting the pools was not
enough on its own, and a review measured why: the SSE route also *read* the
table on the handle its own subscription holds — once before the stream opens
and once per poll after. Every open stream was therefore competing with itself
for the four connections a direct pool has. The fourth stream took the last
one, every stream's next read had nowhere to borrow, and all four failed
together five seconds later; worse, the read threw *after* `subscribe` had
succeeded, so `close()` never ran and the connection stayed held for the life of
the instance. Every later stream on it answered 500.

So the route reads on the pooled handle and holds the direct one, and its
`finally` closes the subscription whatever the body does. Holding and borrowing
from one pool is what turns a limit into a deadlock.

**A pool refuses rather than waits.** `connectionTimeoutMs` defaults to five
seconds on every handle — long enough to outlast a burst, short enough to be a
message rather than a hang. A pool with no free connection is a fact worth
saying out loud, and "the function timed out" is not that fact.

## What was rejected

**Raising `max` on the shared pool.** It moves the number at which the deadlock
happens without removing it, and the two uses would still be competing for the
same budget — a stream count nobody is tracking deciding whether a write lands.

**Polling `events` instead of `LISTEN`.** §5.3's stated fallback, and it is the
right answer if Neon's direct endpoint turns out not to deliver notifications —
which `verify:live` checks. It is not the answer to a pool-sizing problem.

## Consequences

- An instance serving four streams still serves writes.
- A caller that cannot get a connection gets an error naming the timeout, five
  seconds in, rather than a killed invocation sixty seconds in.
- The per-instance stream limit is four, and it is now genuinely four: the
  streams no longer take a fifth connection between them. Exceeding it is one
  stream refused, not four broken and an instance poisoned.
