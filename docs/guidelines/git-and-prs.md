---
id: git-and-prs
title: Git & pull requests
covers: Branching, commits, PR contents, and minimizing conflict surface
tier: always
---

# Git & pull requests

## One PR per change

Open a pull request for every change. Name branches descriptively after the
work they contain — never a generated or random name.

Make normal incremental commits on the working branch. Do not amend or
force-push a branch someone else may have checked out.

## What a PR description contains

- What changed and why, in a few sentences.
- The **Guidelines audited** line required by the root `AGENTS.md`.
- Any decision you made without review, and the reasoning.
- Anything deliberately deferred.

## Never commit

Secrets, credentials, tokens, `.env` files with real values, generated build
output, or dependency directories. If a secret reaches a branch, rotate it —
removing the commit is not sufficient.

## Minimize conflict surface

A merge conflict costs more than the conflict itself: resolve, re-run CI,
possibly re-review. Design concurrent work so conflicts do not arise.

- **Partition concurrent branches by file.** Two open PRs should not need to
  edit the same file. Decide the partition when you plan the work and state it
  in the plan.
- Before starting a branch, check what other open branches touch. If a clean
  partition is not possible, **sequence the work** — serial is cheaper than
  conflicting.
- Land the branch that touches shared surface first, then rebase the others
  onto it.

### Conflict magnets

Do not touch these from concurrent feature branches:

| Surface | How to handle it |
|---|---|
| Changelogs, release notes | One file per change (a Changesets-style entry per PR). If the repo has no such mechanism, add one rather than serializing every PR through a shared file. |
| Barrel files, index re-exports | Avoid barrels entirely — see [files](./files.md). |
| Lockfiles | Land the dependency change in its own PR first, then branch off it. Never bump the lockfile in several open branches at once. |
| Generated and snapshot files | Regenerate after rebase. Never hand-merge a generated diff. |
| Shared config — tsconfig, linter config, task-runner config, CI workflows | One PR at a time, landed before the branches that depend on it. |

If a conflict happens anyway, resolve it and treat it as a planning defect: say
which split caused it so the next partition avoids it.

## Review

Scale review to the change. Skip it for mechanical changes with no behavioral
surface: conflict resolutions taking one side verbatim, comment-only edits,
pure renames, generated-file regeneration, dependency bumps with no code change.

For everything else, at most two review rounds. Round 2 reviews only the diff
round 1's fixes introduced; do not re-review code that already passed. A rebase
or conflict resolution with no semantic change does not consume a round.

### The bar for a finding

A finding is actionable only if it states a concrete failure: specific inputs or
state, and the resulting wrong output, crash, or corruption. If it cannot state
that, it is not a finding.

Out of scope — do not report, do not fix during review:

- Comment, docstring, or prose wording.
- Test assertion style, naming, formatting, lint-adjacent nits.
- "This case isn't covered," with no demonstrated failure the gap would hide.
- Refactors, structural preferences, anything phrased as "consider".

Real but low-consequence findings go under **Deferred** in the review summary.

## Merging

Merge when CI is green and review is complete. If you have a reservation,
merge and state it plainly in the summary — unless the change is destructive or
irreversible, in which case stop and ask.
