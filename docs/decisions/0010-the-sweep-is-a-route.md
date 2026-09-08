# 0010 — The sweep is a route, and there are seventeen

**Status:** accepted · **Date:** 2026-09-08 · **Work package:** deploy readiness

## Context

WP-N8 wrote the one-minute sweep as `apps/auteur-web/api/_cron/sweep.ts` — a
function, tested against a real database, doing exactly what §5.3 asks. WP-R11
wrote `vercel.json` with a cron entry naming `/internal/cron/sweep`.

Nothing connected the two. A module under `api/` whose name begins with `_` is
not a function, and no route answered that path, so the schedule would have
fired into a 404 every minute for the life of the deployment. The sweep exists
to recover a lost stage invocation; the sweep itself was the lost invocation.

Neither work package's tests could catch it: N8's exercised the function and
R11's read the cron entry out of `vercel.json`. Both were true. The gap was
between them, which is where this kind of gap always is.

## Decision

`POST /internal/cron/sweep` joins `api-contract` as the seventeenth route,
`internal: true`, signed with the same stage secret as `/internal/stage`.

**In the contract, not beside it.** `/internal/stage` is in the contract for a
stated reason — it is the route a browser never calls, which makes it the one
whose body is most tempting to trust, and invariant 4 has no exception for
callers you wrote yourself. The cron caller is another caller we wrote. The
same reasoning applies unchanged, and a route defined outside the contract is a
route `_auth.ts` cannot enumerate.

**The stage secret, not the bearer token.** A caller that can release a claim
can disrupt a run in flight, which is not something a value shipped in the
client bundle should reach.

Decision 0005 said sixteen. It counted what existed; this adds one.

## What was rejected

**A non-underscore module under `api/`.** It would deploy as a second function
and answer the path, and it would also be a second place the routing is stated
— which is the thing `api-contract` exists to prevent, and which decision 0005
already had to correct once.

**Leaving the cron entry pointing at nothing until someone noticed.** The
symptom is a queue that slowly fills with `queued` rows nobody runs, on a
schedule that reports success because a 404 is a response.

## Consequences

- `contract.test.ts` counts seventeen and asserts two internal routes.
- `_auth.ts`'s three lists partition the contract, and the deploy test now
  derives the guarded count from the other two rather than from a literal — so
  an eighteenth route must land in exactly one of them.
- `apps/auteur-web/tests/integration/deploy-readiness.test.ts` asserts that the
  path `vercel.json` names is the path the contract declares, and that it
  answers. The two facts are checked against each other rather than separately.
