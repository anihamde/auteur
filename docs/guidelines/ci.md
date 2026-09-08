---
id: ci
title: CI
covers: Keeping CI fast and correct, and what to do when it fails
tier: reference
---

# CI

CI runs `bun run turbo test` on every pull request and on the default branch.
Nothing merges red.

## Failures

- **A failure your change introduced** is yours: fix it and push a follow-up
  commit.
- **A pre-existing failure** gets fixed in a separate PR, never folded into the
  current one.
- **"Flake" is not a root cause.** Re-run a job only to confirm a failure that
  is provably not yours — one that reproduces identically on the default
  branch, or that died before any test body ran. A second failure is real.
- **Never skip, disable, or quarantine a test to get green.**
- If a commit lands on the default branch while your PR is open, rebase.

## Keep CI fast

Slow CI makes the monitor-and-rebase loop expensive. Treat runtime as part of
the work.

- **Cache dependencies**, keyed on the lockfile.
- **Turn on remote caching** for the task runner so hits survive across
  runners, branches, and PRs. Verify each task's `inputs` and `outputs` are
  declared accurately — inaccurate ones silently defeat the cache, or worse,
  produce a stale hit.
- **Run only what the change affects**, using the task runner's filter against
  the merge base. This needs history on the runner: set `fetch-depth: 0`, or
  fetch the base ref explicitly.
- **Add a concurrency group keyed on the ref** so superseded runs are cancelled
  rather than finishing.
- **Run independent jobs in parallel.** Lint, typecheck, and test do not depend
  on each other.
- Pin the toolchain versions so runners and local machines agree.

If a step is slow, rebuilding unchanged work, or missing its cache, fix it in a
separate PR.

## Required checks

The branch protection required-check set includes tests, typecheck, lint, and
format. A check that is advisory in practice should be deleted or made
required; an ignored red check trains everyone to ignore red checks.
