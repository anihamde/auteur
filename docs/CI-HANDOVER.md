# CI — activated

`.github/workflows/ci.yml` is live on `main` as of commit `39a89d3`. Nothing
further is needed. This note stays as the record of why the file took the route
it did, and what to do if it ever needs changing.

## Why it was staged rather than committed directly

The build session's token cannot write to `.github/workflows/`. Verified, not
assumed:

```
! [remote rejected] refusing to allow an OAuth App to create or update
  workflow `.github/workflows/ci.yml` without `workflow` scope
```

So the file was written to `ci/workflows/ci.yml` and moved by hand.

## If it ever needs changing

Same route: a new file under `ci/workflows/`, then

```sh
git mv ci/workflows/ci.yml .github/workflows/ci.yml
```

It should not need to. The jobs do not name individual gates — they run:

- `bun run turbo test` — lint, types, unit tests, contracts
- `bun run gates` — every gate registered in `scripts/gates.ts`
- `bun run gate-self-test` — proof that each gate rejects its own defect
- `bun run turbo build` — the bundle, gate 11

`scripts/gates.ts` is a registry each gate script adds itself to, so adding a
gate is an ordinary pull request touching a script and one line of that
registry. Everything the workflow file itself decides is already in it: the
concurrency group, the cache keys, `--affected` on pull requests with a full run
on `main`, and the three jobs in parallel.

## Behaviour before the toolchain exists

Each job's first step looks for a root `package.json` and short-circuits green
with a notice if there is none, so the file does not redden a docs-only pull
request. It starts doing real work at WP-A1; the `build` job starts at WP-R1.

## Pinned versions

`BUN_VERSION` is `1.3.11`. `scripts/check-bun-version.ts` asserts that this
value, the root `package.json`'s `engines.bun`, and `.bun-version` all agree, so
they cannot drift apart silently. **If the workflow's pin is ever changed, that
gate is what catches the repository not being changed with it.**
