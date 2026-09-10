# 0025 — Nothing asks gutendex

**Status:** accepted · **Date:** 2026-09-10 · **Work package:** deploy readiness

## Context

Decision 0023 moved the corpus index into this database. Search reads
`authors`, `corpus-select` reads `catalogue_works`, and `work-fetch` downloads
from `gutenberg.org` — the host the probe showed answers a serverless function
normally. After that, `gutendex.ts`, `schema.ts` and the provider seam were
still compiled, still tested, and called by nothing on the product's path.

`/api/internal/corpus-probe` was written to answer one question — which corpus
hosts a function can reach — and its own contract entry said to delete it once
the answer was recorded. It is recorded, in 0023.

`verify:live` was worse than dead. Step 3 of `DEPLOY.md` tells the operator to
run it, and its second sub-report parsed a live gutendex response against a
schema nothing reads. On a deployment that works, it fails; on one that does
not, it fails for the wrong reason.

## Decision

**Deleted:** `gutendex.ts`, `schema.ts`, the `CorpusProvider` seam
(`searchAll`, `withLocalFacts`, `createGutenbergProvider`, `AuthorFacts`),
`foldAuthors`, the synthetic gutendex fixture, `scripts/probe-gutendex.ts`, and
`GET /api/internal/corpus-probe` with its contract entry. Seventeen routes
again.

**Kept, moved:** `detailLine` and `AuthorResult` are `author-row.ts`. They are
what the author screen needs and were never about providers; a file called
`provider.ts` holding neither a provider nor a seam is prose that has stopped
describing its code.

`FetchLike` and `USER_AGENT` move into `fetch.ts`, which is now the only thing
that makes an outbound request.

**`mintAuthorId` takes the catalogue's own shape.** It took `GutendexPerson` —
`{ name, birth_year, death_year }` — which was the last reason `schema.ts`
existed. It takes `{ name, birthYear }`: the two fields the id is minted from,
in this codebase's casing. `scripts/import-catalogue.ts` calls it directly, and
its `authorIdFor` adapter is gone with the shape it adapted.

**`verify:live`'s second check is now the catalogue import.** Author search and
`corpus-select` both read tables that are empty on a fresh database, and
nothing else says so: search answers 200 with no rows, which is also what a
misspelt name looks like, and the run fails two screens later with
`corpus_unavailable`. The check counts both tables and names the command that
fills them. A count that throws is the same finding one step earlier — the
schema has never come up — and is reported rather than propagated, because a
stack trace would take the other three sub-reports with it.

## What was rejected

**Keeping the provider seam for `PRD.md` §8's secondary tier.** The seam was
built so a second provider unions in without the caller changing. Search is a
SQL query now, and a secondary tier will union against that — which is a
different seam, written when there is a second provider to shape it. Keeping
this one preserves the wrong shape and the cost of maintaining it.

`unavailable` stays in the response and stays empty. The screen renders it, the
contract declares it, and it is the honest answer to "which providers failed"
when none were asked.

## Consequences

- `@auteur/corpus-gutenberg` has no third-party dependency at all: zod went
  with the schema.
- Nothing in the repository requests `gutendex.com`.
- `contract.test.ts` counts seventeen routes and asserts two internal ones.
