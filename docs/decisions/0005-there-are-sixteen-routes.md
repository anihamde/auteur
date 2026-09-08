# 0005 — There are sixteen routes, not fourteen

**Status:** accepted · **Date:** 2026-09-08 · **Work package:** WP-M1

## Context

`ARCHITECTURE.md` §7.1 opens: *"Fourteen, described once in `api-contract` as
zod"*, and then lists **sixteen**. `docs/IMPLEMENTATION-PLAN.md` repeats the
fourteen in wave M/N's heading and in WP-N9's proof line.

The list is right and the count is wrong. Counting the block:

- fourteen browser routes, `health` through `export`;
- the SSE route, `GET /api/sessions/:id/events`, listed after them;
- `POST /internal/stage`, under the divider that marks it as never reached by a
  browser.

Fourteen is the count of the first group. It reads as the count of the whole
list because the list is one block.

## Decision

`api-contract` carries **sixteen**, and `contract.test.ts` asserts sixteen —
counted from the object rather than written down, so the number is a property of
the contract rather than a comment that goes stale in the same way.

The two that are not "browser routes" are distinguished by a field rather than
by their position in a list:

- `internal: true` on `/internal/stage`, and `publicRoutes()` filters on it. A
  route that must never be reachable from a browser should not be reachable by
  someone forgetting to exclude it.
- `stream: true` on the events route, and `streamingRoutes()` filters on it.
  That route is the only one that reads the direct connection string, because
  `LISTEN` is a session-level feature a pooled connection cannot honour — and a
  pooled `LISTEN` is accepted and then simply never delivers, which is the
  worst shape this failure can take.

Both fields exist because the distinction has consequences in code. Encoding
them as fields rather than as prose is what lets N7's and N9's proofs be
assertions over the contract instead of a reviewer checking a list.

## Why the documents are not edited to say sixteen

They are the record of what was designed. This file is the record of what the
code does, and the two disagreeing about a count is exactly the kind of thing a
decision file exists to hold — the alternative is a silent edit to a merged
architecture document, which is what `docs/IMPLEMENTATION-PLAN.md` §2.4 asks
contributors not to do.

## Consequences

- Anything reading "fourteen routes" in `ARCHITECTURE.md` §7.1 or the plan's
  wave M/N should read sixteen.
- `ROUTE_NAMES.length` is the number, and the test that asserts it fails if a
  route is added or removed without the count moving with it.
