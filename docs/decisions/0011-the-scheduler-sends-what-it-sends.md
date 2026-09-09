# 0011 — The scheduler sends what it sends

**Status:** accepted · **Date:** 2026-09-09 · **Work package:** deploy readiness
· **Amends:** [0010](0010-the-sweep-is-a-route.md)

## Context

Decision 0010 gave the sweep a route and signed it with the stage secret over
an HMAC of the request body, matching `/internal/stage`. That is the right
shape for a caller we wrote. The cron caller is not one: Vercel Cron invokes
the path with **GET**, and sends **no body** — there is nothing to sign — and
authenticates by sending `Authorization: Bearer $CRON_SECRET`.

The route would have answered 401 to every invocation, once a minute, forever,
on a schedule whose dashboard reports the request as delivered. 0010 predicted
the failure mode of a mismatched sweep exactly and then shipped a different
instance of it.

## Decision

`/internal/cron/sweep` accepts **GET and POST**, and authenticates with a
constant-time comparison against `CRON_SECRET` rather than an HMAC.

**GET, because the scheduler sends GET.** A route's method is not a design
choice when exactly one caller exists and it is a platform.

**A bearer token, because there is no body to sign.** An HMAC over an empty
payload authenticates the secret and nothing else, which is what a bearer token
is; writing it as a signature would only imply an integrity property the
request cannot have. POST stays accepted so the route is callable by hand
during an incident.

**Its own secret.** The sweep can release a claim, so it stays off the token
shipped in the client bundle — but it is not the stage secret either: a
schedule configured in a dashboard is a different blast radius from the code
path that invokes stages.

## What was rejected

**Teaching the scheduler to POST a signed body.** It cannot; the schedule
configuration is a path and a cron expression.

**One shared internal secret.** Two callers with different reach, one value:
rotating for either rotates for both.

## Consequences

- `internalSweep` in `api-contract` carries `method: "GET"`.
- `CRON_SECRET` joins `env-spec.ts` as a required key — under that name, with
  no `AUTEUR_` prefix, because the scheduler attaches the header only when a
  variable of exactly that name exists. A prefixed copy would mean setting one
  secret twice, and a deployment that set only the platform's name would refuse
  every invocation. A deployment missing it fails at boot rather than at the
  first sweep.
- 0010's other half stands: the route is in the contract, and the deploy test
  still checks `vercel.json`'s path against the contract's.
