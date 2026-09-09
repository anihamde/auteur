# 0013 — The sweep runs on traffic

**Status:** accepted · **Date:** 2026-09-09 · **Work package:** deploy readiness
· **Amends:** [0010](0010-the-sweep-is-a-route.md),
[0011](0011-the-scheduler-sends-what-it-sends.md)

## Context

§5.3 specifies a one-minute sweep, and decisions 0010 and 0011 built it as a
route the platform's scheduler calls. The deployment rejected the schedule:

> Hobby accounts are limited to daily cron jobs. This cron expression
> (`* * * * *`) would run more than once per day.

A daily sweep is not a slower version of the feature; it is the absence of it.
The sweep is the only thing that notices a lost stage invocation — a queue row
still `queued` that nobody came to run, or a `claimed` row that stopped moving —
and there is no supervising process to notice anything else. A run that stalls
at two in the afternoon would resume the next morning, which nobody would wait
for.

The plan is not the interesting part. Even on a plan that allows it, the
scheduler is a strange primary trigger for this: it fires whether or not
anything is happening, and it does not fire faster when something is.

## Decision

**Any request may run the sweep, at most once every 30 seconds.** The cron
entry stays, at the daily frequency the platform allows, as a backstop for a
deployment nobody is using.

**The throttle is a row, not a timestamp in memory.** `claimSweep` is a
conditional `UPDATE ... RETURNING` on a single-row `sweep_state` table —
exactly the shape `stage_queue` uses to claim a stage. Function instances do
not share memory and a cold start per request is the normal case here, so an
in-memory timestamp would be a fresh one per request: no throttle at all.

**Before the handler, not after.** A serverless instance may be frozen the
moment its response is written, so work scheduled for after the response is
work that may never happen.

**`/api/health` drives it too, without a token.** An idle deployment's only
traffic is a platform probe. The sweep re-invokes work that is already overdue
and nothing else, and the throttle bounds an unauthenticated caller to exactly
what an authenticated one can cause.

**A failed sweep never fails the request.** The request belongs to someone; the
sweep belongs to no one, and there is another one along in thirty seconds.

## What was rejected

**Upgrading the plan.** It would buy the minute-level schedule and change
nothing about the design being wrong: recovery driven by a clock that does not
know whether anything is running, rather than by the traffic of the person
waiting for it.

**A client-side trigger.** The sweep's authority is the scheduler's secret, and
putting that in the bundle would let anything holding the client's token
release claims on a run in flight.

**Sweeping inside `/internal/*`.** A sweep would trigger a sweep, and it would
put the work in front of the one request whose latency is a stage's latency.

## Consequences

- Migration `0005_sweep_state` adds the table, with a primary key that can hold
  only `true` so a second row cannot appear.
- Recovery is now *faster* than the one-minute cron: a stalled run is picked up
  on the next request within 30 seconds, and requests are exactly what a person
  watching a run generates.
- An idle deployment with no probe traffic falls back to the daily cron. A
  stalled run on a deployment nobody is looking at waits — which is the case
  where nobody is waiting.
- `deploy.test.ts` asserts the schedule is *not* minute-level: the expression
  the platform rejects is a deploy that fails, not a sweep that runs.
