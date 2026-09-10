# 0026 — A route writes on a handle that can hold it

**Status:** accepted · **Date:** 2026-09-10 · **Work package:** deploy readiness

## Context

Nothing had ever run on the deployment. Three separate reasons, found together
because the first one made the other two invisible.

**`entry.ts` was type-checked nowhere.** `apps/auteur-web/tsconfig.json`'s
`include` named `api`, the directory the routes lived in before decision 0017
moved them to `server/`. Naming a directory that does not exist is not a tsc
error, so for four work packages the routes were compiled only where a test
happened to import them — and `entry.ts`, which nothing imports, was compiled
nowhere at all.

It had lost a function to a refactor and kept the call to it:

```ts
const url = new URL(pathFor("internalStage", {}), selfOrigin());
```

`selfOrigin` was deleted by the change that added the deployment-protection
bypass header beside it. Every stage invocation threw `selfOrigin is not
defined` — into the `void`ed promise that was there to keep a lost request from
being a lost run. So the queue filled, the sweep re-invoked into the same
throw, and nothing anywhere said why.

**`append` and `putPins` need a transaction, and no route has one.**
`createDb` refuses `transaction` on a pooled handle (§3.1), and `entry.ts`
builds every route's handle pooled, because function instances are plural. So
appending an event — which wraps its insert and its `NOTIFY` together, since
Postgres holds notifications until commit — threw on the deployment and only on
the deployment. Every test's handle is `createTestDb`'s direct one.

**`failStage` was a transaction too.** The only path that runs when a stage
fails threw on its way out, leaving the row `claimed` until the sweep released
it five minutes later. The retry budget existed and was unreachable.

## Decision

**`include` names `server`**, in `scripts/new-package.ts` where the app's
tsconfig is generated. That list decides whether the deployed code is
type-checked at all, and `scripts/app-include.test.ts` now holds both halves of
the failure: a name that matches no directory, and a directory holding
TypeScript that nothing names.

**`AppDeps.directDb` is the handle for writes that must hold a transaction**,
and it is the same connection `events.directDb` already opened for `LISTEN`.
`append` and `putPins` run on it; everything else stays pooled. Absent, it
falls back to `db`, which is the test case — every handle there is direct
already.

**`failStage` is one statement, not a transaction.** A data-modifying CTE gives
the same atomicity on any handle: the `UPDATE` that marks the attempt `error`
and the `INSERT` that requeues the next are one command, and the `INSERT` reads
the `UPDATE`'s own `RETURNING` rather than a second query's answer. It needs no
direct handle, so the failure path does not depend on one being configured.

**`FailureOutcome`'s `released` carries no row.** The only way to hand one back
was to left-join it onto the two outcomes that have none, which made every
column nullable in a type where none of them is. No caller read it.

## What was rejected

**Rewriting `append` as one statement too.** It looked possible — a CTE that
locks, inserts `max(seq) + 1` and calls `pg_notify` — and it is wrong: every
sub-select in a statement uses the snapshot taken at statement start, so an
advisory lock acquired inside it cannot make the second caller re-read the
sequence. Two concurrent appends would compute the same `seq` and one would
violate the events primary key. The row lock `append` already takes is the
correct mechanism, and it needs a real transaction.

**Making every handle direct.** It removes the distinction the pooled endpoint
exists for: function instances are plural and short-lived, and Postgres has a
hard connection limit. The transactional writes are few.

## Consequences

- `pooled.test.ts` builds `createApp` the way `entry.ts` does — pooled for
  reads, direct for the transactional writes — and drives both paths. Every
  other suite builds it on one direct handle, which is why none of them saw
  any of this.
- A stage's events reach the stream, which is what the research screen renders.
- `verify:live` needs `DATABASE_URL_DIRECT` for its `LISTEN` check and the
  deployment needs it for these writes: the same variable, already documented.
