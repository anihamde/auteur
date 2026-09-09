# 0021 — Selecting an author records one

**Status:** accepted · **Date:** 2026-09-09 · **Work package:** deploy readiness

## Context

A curl against the live deployment:

```
POST /api/sessions/:id/author
{"error":{"code":"not_found","message":"There is no such route."}}
```

`selectAuthor` was in the contract, called by `src/screens/author.tsx`, and
mounted nowhere. The wizard could not get past step two. Every test was green.

**Why nothing caught it.** `deploy.test.ts` asserts that every guarded route
answers 401 without a token — and the bearer middleware answers *before*
routing, so a contract entry with no handler is indistinguishable from one that
works. The screens' own tests drive a fake transport. The one test that would
have noticed is the one nobody writes: does a request with a *valid* token
reach a handler at all.

Implementing it surfaced the second half. `sessions.author_id` references
`authors(id)`, and **nothing in the application had ever written that table.**
Search reads Gutendex and deliberately does not store what it finds — typing a
name must not fetch a corpus — and `upsertAuthor` existed in `corpus-store`
with no caller outside its own tests. So even with the route mounted, the write
failed on the foreign key.

## Decision

**`POST /api/sessions/:id/author` carries the whole author row**, not just the
id. The screen is holding it already; the route upserts it, then points the
session at it. That is the moment an author becomes something this system knows
about, and it has to precede the reference to it.

**Choosing an author enqueues the research stages.** It is the second of the
two moments work begins: nothing on the research screen calls `advance`,
because by the time it renders the corpus is already being fetched. The
enqueue reuses `enqueueStaleUpTo`, extracted from the advance route — §7.1 says
one route *starts* work, and this keeps that decision expressed once and called
from the two places that make it.

**The provider is read from the id**, not assumed. A secondary tier (PRD §8)
arrives as a second prefix, and an id matching none is a client sending
something it did not get from search.

## What was rejected

**Taking only the id and looking the author up.** The route would fetch from
Gutendex by id to fill a row the caller already has, and a search provider
being slow would make choosing an author slow.

**Dropping the foreign key.** It is the constraint that made this visible at
all. Without it the session would point at an author no table has, and the
failure would arrive three stages later as an empty corpus.

## Consequences

- `deploy.test.ts` asserts that **no route in the contract answers "there is no
  such route" to a request carrying a valid token**. Its fixture now supplies
  every optional dependency, because an app missing one has unmounted routes
  that cannot be told apart from unwritten ones. Removing
  `selectAuthorRoutes` from `_app.ts` fails it.
- Three tests in `advance.test.ts` cover the behaviour: the row is recorded and
  four stages enqueued; the same author again enqueues nothing; a different
  author restales the run.
- `selectAuthor`'s body changed shape, so the client changed with it. Nothing
  else calls the route.
