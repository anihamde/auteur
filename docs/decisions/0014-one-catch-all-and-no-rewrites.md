# 0014 — One catch-all, and no rewrites

**Status:** accepted · **Date:** 2026-09-09 · **Work package:** deploy readiness
· **Amends:** [0005](0005-there-are-sixteen-routes.md),
[0010](0010-the-sweep-is-a-route.md)

## Context

The first deployment answered 404 to `/api/health`.

Two things were wrong with how the routes reached a function, and each on its
own is enough to produce that:

**The file name.** The entry was `api/[[...path]].ts`. The doubled bracket is
Next.js's *optional* catch-all; the platform's own file-system routing uses the
single form, `[...path]`, and a file whose name it does not recognize as a
dynamic route is a function at that literal path — one nothing requests.

**The rewrites.** `vercel.json` rewrote `/api/(.*)` and `/internal/(.*)` to
`/api`, on the assumption that the function would still see the requested path.
It does not: a rewrite hands the function the **destination**. Every request
would have arrived at the app as `/api`, and the app routes on what it is
given, so a working rewrite would have been worse than a broken one — one route
answering everything.

The rewrites existed because `/internal/stage` and `/internal/cron/sweep` sat
outside `/api/`, and only `/api/` has file-system routing.

## Decision

**Every route lives under `/api/`,** the two internal ones included:
`/api/internal/stage` and `/api/internal/cron/sweep`. There are no rewrites at
all, and `api/[...path].ts` answers everything with the requested path intact.

**`/api/internal/` is not what makes a route internal.** `specOf(name).internal`
still is, and `isInternalPath` is derived from the contract rather than from the
prefix — a prefix is a convention, and a convention checked by hand is one a
route can quietly fall outside of. The bearer middleware and the traffic sweep
both use it, so both agree by construction about which routes carry their own
secret.

## What was rejected

**Keeping `/internal/` and adding a correct rewrite.** There isn't one. A
rewrite that preserved the path would have to rewrite to itself, and a rewrite
to a different path is a path the app does not know.

**A second function at `api/internal/[...path].ts`.** Two functions, two cold
starts, two copies of the app's construction — for a URL prefix.

**Reading `x-vercel-original-path` in the app.** Routing on a header the
platform may or may not set, to undo something we chose to do.

## Consequences

- `AUTEUR_STAGE_SECRET` and `CRON_SECRET` now guard paths under `/api/`. The
  guard is the secret, not the prefix, and `deploy.test.ts` still asserts a
  bearer token is refused on both.
- `vercel.json`'s cron path is asserted equal to `specOf("internalSweep").path`
  rather than merely containing "sweep", and the absence of `rewrites` is
  asserted outright.
- A new test fails if any route's path falls outside `/api/`, which is the
  condition that would require a rewrite again.
- The public URL of the two internal routes changed. Nothing external calls
  them: the scheduler is configured from `vercel.json`, and the stage route is
  called by the deployment itself through `pathFor`.
