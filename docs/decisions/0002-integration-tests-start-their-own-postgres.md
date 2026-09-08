# 0002 — Integration tests start their own Postgres

**Status:** accepted · **Date:** 2026-09-08 · **Work package:** WP-G0..G4

## Context

Half of this repository's proof lives in `tests/integration/`. Every store's
guarantees are guarantees *of Postgres* — a unique constraint, a conditional
update that either claims a row or does not, a foreign key that cascades — and
`docs/IMPLEMENTATION-PLAN.md` §6 wave H states the rule plainly: there is no
mocked database anywhere in `packages/`.

`.github/workflows/ci.yml` has no `services:` block and no
`AUTEUR_TEST_DATABASE_URL`. It cannot get one: the workflow was written once and
handed over, and the build session cannot push to `.github/workflows/`
(`docs/CI-HANDOVER.md`). Left alone, every store PR would have merged with its
integration suite never executed and CI green.

The plan did not say how those suites reach a database on CI. This is that
answer.

## Decision

`scripts/test-postgres.ts` starts a throwaway cluster from the PostgreSQL
binaries already present on the machine — every GitHub-hosted `ubuntu-latest`
image ships a stopped server under `/usr/lib/postgresql/<major>/bin` — on
`127.0.0.1:55432`, with trust auth and its socket inside its own data
directory. `scripts/package-tests.ts` calls it whenever a package has
`tests/integration/` and depends on `db`, and runs those suites in `test:unit`
as well as `test:coverage`. So gate 3 covers them, on CI, with no workflow edit.

One cluster is shared by every package, because turbo runs `test:unit` once per
package and initialising a cluster each time would dominate the run. Sharing is
safe: `@auteur/test-db` gives every suite its own *database* on the server,
which is the isolation the suites need. A `mkdir` without `recursive` is the
atomic test-and-set that keeps concurrent turbo tasks from initialising twice.

**No server available is a failure, never a skip.** A suite that silently does
not run is worse than no suite, because the gate still reports green.

## Consequences

- Contributors need a PostgreSQL server installed. They do not need one
  running, configured, or pointed at by an environment variable.
- `AUTEUR_TEST_DATABASE_URL`, when set, still wins — which is how the deploy's
  own branch database would be used.
- A CI image that stops shipping PostgreSQL turns every database suite red
  rather than green. That is the correct direction to fail in.
- `test:coverage`'s database check moves from "the variable is set" to "a
  server was obtained", which is the thing that actually matters.
