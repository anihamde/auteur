# Activating CI

`ci/workflows/ci.yml` is the repository's complete CI workflow. It is not in
`.github/workflows/` because the build session cannot put it there: pushing to
that directory requires the `workflow` OAuth scope, and the push is rejected
outright without it.

```
! [remote rejected] refusing to allow an OAuth App to create or update
  workflow `.github/workflows/ci.yml` without `workflow` scope
```

## Activate it

```sh
mkdir -p .github/workflows
git mv ci/workflows/ci.yml .github/workflows/ci.yml
git commit -m "ci: activate the workflow"
git push
```

That is the whole handover. From that point every pull request is checked.

## What it does before there is any code

Nothing, and it says so. Each job's first step looks for a root `package.json`
and short-circuits green with a notice if there is none, so adding this file
ahead of the toolchain does not redden a docs-only pull request. It starts
doing real work at WP-A1, which lands the toolchain, and the `build` job starts
at WP-R1, which lands the first bundle.

## Why it never needs changing again

The jobs do not name individual gates. They run:

- `bun run turbo test` — lint, types, unit tests, contracts
- `bun run gates` — every gate registered in `scripts/gates.ts`
- `bun run gate-self-test` — proof that each gate rejects its own defect
- `bun run turbo build` — the bundle, gate 11

`scripts/gates.ts` is a registry each gate script adds itself to. Adding a gate
is an ordinary pull request touching a script and one line of that registry —
no workflow edit, and no second handover. Everything the workflow file itself
has to decide is already in it: the concurrency group, the cache keys,
`--affected` on pull requests and the full run on `main`, and the three jobs
running in parallel.

If it ever does need changing, the change arrives the same way: a file under
`ci/workflows/`, and these commands again.

## Pinned versions

`BUN_VERSION` is `1.3.11`. `scripts/check-bun-version.ts` asserts that this
value, the root `package.json`'s `engines.bun`, and `.bun-version` all agree, so
they cannot drift apart silently.
