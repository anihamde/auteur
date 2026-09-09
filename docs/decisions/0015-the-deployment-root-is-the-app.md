# 0015 — The deployment root is the app, not the repository

**Status:** accepted · **Date:** 2026-09-09 · **Work package:** deploy readiness
· **Supersedes:** [0014](0014-one-catch-all-and-no-rewrites.md)'s root
placement (its routing decisions stand)

## Context

Decision 0014 put `api/[...path].ts` at the repository root, because
`vercel.json` was there and the platform builds a function per file in the
`api/` directory *at the root of the deployment*. That produced a function, and
the function crashed during import:

```
FUNCTION_INVOCATION_FAILED: ResolveMessage {}
```

A module-resolution failure. The cause is not the platform's: **workspace
packages are linked into the `node_modules` of the package that depends on
them, not into the repository root.** The repository root's `node_modules/@auteur`
holds exactly two entries — `biome-config` and `tsconfig`, the two the root
`package.json` names. Everything else lives under
`apps/auteur-web/node_modules/@auteur`.

So a file at the repository root cannot import `@auteur/api-contract`. Not on
the platform and not locally; `tsc` says the same thing, in the form of every
type from those packages silently becoming `any`. The layout was wrong before
it was deployed, and nothing checked it because nothing at the repository root
had ever imported a workspace package.

## Decision

**The deployment root is `apps/auteur-web`.** `vercel.json` moves there, its
build and install commands step up to the workspace root (`cd ../.. && bun
install`, `cd ../.. && turbo build --filter`), and its `outputDirectory` is the
app's own `dist`. The project setting **Include files outside of the Root
Directory** is on, because the build reads `packages/` and the workspace
lockfile.

The API returns to `apps/auteur-web/api/`, where it always was: beside the app
it serves, inside the package that declares its dependencies, with
`node_modules` next to it.

This is the layout `ac-zeitgeist/nexus` deploys with, which is the strongest
evidence available here — a monorepo of the same shape, in production, on this
account.

## What was rejected

**Adding every `@auteur/*` package to the root `package.json`.** It would make
the resolution work and make the root package a second declaration of the app's
dependency list, which `packages.manifest.ts` exists to be the only one of.

**A re-export at the repository root.** That was the previous shape. It moves
the resolution problem one file along: the re-exported module still imports
`@auteur/*` from a directory where they are not linked. It also adds a file
that nothing typechecks and no package tests.

**Bundling the function to a single self-contained file.** It would work, and
it puts a build step between the source and what runs, for a problem whose
actual cause is a directory.

## Consequences

- `deploy-readiness.test.ts` asserts that nothing under `api/` imports a
  relative path that climbs out of it — the class of defect this was. A
  workspace specifier is fine; a `../../` is not.
- The same test resolves `vercel.json`'s `functions` glob against the app
  directory rather than the repository.
- `docs/DEPLOY.md`'s first step changes: Root Directory is `apps/auteur-web`,
  with "include files outside" on.
- 0014 stands otherwise: one catch-all, no rewrites, every route under `/api/`.
