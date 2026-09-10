# 0023 — The corpus index is held here

**Status:** accepted · **Date:** 2026-09-10 · **Work package:** deploy readiness

## Context

Author search failed on every deployment and worked from a laptop. A probe run
from inside a function asked both corpus hosts directly:

```json
{"host": "gutendex.com",   "outcome": "refused", "status": 403, "ms": 48,
 "detail": "cloudflare · <!DOCTYPE html>…<title>Just a moment...</title>…"}
{"host": "gutenberg.org",  "outcome": "ok",      "status": 200, "ms": 246}
```

`Just a moment…` is Cloudflare's managed challenge. It is not a ban to appeal
or a header to add: it expects a browser to run JavaScript, and a serverless
function is not going to. Every request from the deployment gets it; every
request from a residential address does not.

**The host that carries the book text answers normally.** Only the index is
unreachable, and the index is the part this system does not have to ask anyone
for.

## Decision

**Project Gutenberg's catalogue is imported into this database, once, and
search reads it.** `bun run catalogue:import` downloads the published CSV,
folds it into authors and their works, and writes `authors` and a new
`catalogue_works`.

**It runs from anywhere with egress**, pointed at the deployment's database.
That is what makes it work today: the import never runs on the blocked network,
and after it, neither does search.

**`authors` is the catalogue, not a cache of it.** A row there has always meant
"an author this system knows about", and `measured_words` staying null is
already how it says "not yet measured". The import updates names, dates and
work counts and never touches `measured_words` — a measured author stays
measured across an import, which is why this upserts rather than truncates.

**`catalogue_works` is separate from `works`.** A catalogue row is a book that
exists; a `works` row is a book this system has read and cleaned, and its
`text` is `NOT NULL` because that is the whole point of it. Folding them would
mean a nullable text on the table whose guarantee is that the text is there.

**English texts only.** Every measure here is built for English prose, and a
corpus in a language the segmenter cannot read would produce numbers that look
like measurements.

## What was rejected

**Proxying the requests.** It would fix search and downloads in one change, and
it puts a third party in the path of every keystroke — plus a place the corpus
text can be logged. It is the right answer if the *text* host were blocked
too; the probe is what established that it is not.

**Solving the challenge.** A headless browser to get an author list is a
browser to run, keep, and explain.

**Truncating and reloading.** An import is not a fact about measurement, and
`measured_words` and every `works` row are.

## Consequences

- Search stops leaving the database. No timeout to tune, no provider to be
  unavailable, no rate limit on typing.
- The catalogue goes stale between imports. It is a list of books published
  before 1929; a stale week costs nothing, and re-running the import is one
  command.
- `corpus-select` reads `catalogue_works` rather than searching gutendex, and
  `work-fetch` is unchanged: it already downloads from the host that answers.
- The parser has never seen the file — the same position the gutendex schema
  was in when it broke. So the header is checked before a row is read, and the
  failure names the column that moved rather than importing a catalogue of
  empty strings.
- `/api/internal/corpus-probe` has answered its question and is deleted with
  the work package that replaces it.
