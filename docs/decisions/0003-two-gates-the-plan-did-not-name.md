# 0003 — Two gates the plan did not name: interpolated SQL, and migration order

**Status:** accepted · **Date:** 2026-09-08 · **Work package:** WP-G1, WP-G4

## Context

`docs/IMPLEMENTATION-PLAN.md` §6 asks WP-G1 for "a lint rule failing any
template-literal interpolation into SQL, with a fixture that trips it", and
WP-G4 for a "`check-migrations.ts` [that] rejects a fixture migration that drops
or renames a column in the same file that adds its replacement". Neither is
expressible in Biome: the first needs to know that a template literal is SQL,
the second reads `.sql` files Biome never sees.

## Decision

Both land as registered gates rather than as lint configuration.

**Gate 13 — no SQL is built by interpolation** (`scripts/check-sql-literals.ts`).
Any template literal whose static text looks like SQL may interpolate nothing,
with one exception: a call to `identifier()` from `@auteur/db/sql`, which
refuses anything that is not a plain identifier rather than escaping it, so the
only values that can reach it are ones written in the source. Tests are scanned
too — a test is where an interpolated query is most tempting and least noticed.
The scan is a hand-rolled lexer rather than a regex, because it has to know the
difference between a backtick in code and one inside a comment or a quoted
string.

**Gate 14 — migrations expand before they contract**
(`scripts/check-migrations.ts`). A destructive statement may not appear in a file
that also adds something (`ARCHITECTURE.md` §3.3). It also checks that versions
are contiguous from `0001` and that the committed generated manifest matches the
files on disk — the same file set, and a stale manifest is a database that
silently stops migrating.

Both carry `gate-self-test.ts` cases, per §2.2.

The keyword lists in both are deliberately keyword lists and not parses. A false
positive costs someone writing the query differently; a false negative is an
injection, or a rollout that fails on the previous version's invocations.

## Consequences

- The gate count in §2.2 is 12 in the plan and 14 in the tree. The registry in
  `scripts/gates.ts` is the authority; the plan's list is where it started.
- `identifier()` acquires a second reason to exist: it is the escape hatch gate
  13 recognises, so a query that genuinely needs a dynamic table name has one
  sanctioned way to write it.
