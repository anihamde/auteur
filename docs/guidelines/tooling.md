---
id: tooling
title: TypeScript tooling
covers: Bun, Turborepo, and Biome — the standard toolchain and its commands
tier: always
---

# TypeScript tooling

## The stack

| Tool | Role |
|---|---|
| **Bun** | Package manager, script runner, test runner, and TypeScript runtime. |
| **Turborepo** | Task orchestration and caching across workspaces. |
| **Biome** | Linter and formatter, one tool, one config. |

Do not introduce a second tool for a job one of these already does — no ESLint
or Prettier alongside Biome, no npm or pnpm alongside Bun, no per-package build
scripts that bypass Turbo.

## Tasks

Every package defines the same task names so Turbo can run them uniformly:

- `test` — the package's full verification: unit tests, typecheck, lint.
- `typecheck` — `tsc --noEmit`.
- `lint` — `biome check`.
- `fix` — `biome check --write`, for auto-fixable findings.
- `build` — only where an artifact is actually produced.

`bun run turbo test` runs everything across the workspace. It must pass before a
PR opens and after every push to it. When it fails on formatting or lint, run
the `fix` task before editing by hand.

Declare each task's `inputs` and `outputs` in `turbo.json` accurately.
Inaccurate declarations silently produce stale cache hits, which is worse than
no cache.

## Biome

One `biome.json` at the root; packages do not fork it. Recommended rules are on.
Formatting is not a matter of taste — the formatter decides, and its output is
committed.

Suppressions are exceptional and must carry a reason:

```ts
// biome-ignore lint/suspicious/noExplicitAny: third-party callback signature
```

An unused or misplaced suppression is itself a lint failure. Treat every
warning as a failure — see [testing](./testing.md).

## Bun

- `bun install` — the lockfile is committed and is a conflict magnet; see
  [git-and-prs](./git-and-prs.md).
- `bun test` — the test runner. No Jest, no Vitest.
- Run TypeScript directly. Do not add a build step for scripts or tests.
- Use Bun's built-in APIs (`Bun.file`, `Bun.serve`, `Bun.password`) over a
  package that reimplements them, but prefer Web-standard APIs (`fetch`, `URL`,
  `crypto`) where they exist, so code stays portable to the deploy target.

## Versions

Use the latest stable version of a new dependency unless a specific
compatibility reason forces older. Pin the toolchain itself — Bun, Turbo,
Biome, TypeScript — to an exact version so CI and local machines agree.
