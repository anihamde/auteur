# 0017 — The routes live in `server/`, and the build is told what to build

**Status:** accepted · **Date:** 2026-09-09 · **Work package:** deploy readiness
· **Amends:** [0016](0016-the-build-produces-the-deployment.md)

## Context

The first deploy under the Build Output API worked, and did more than it was
asked to. After `built .vercel/output` the log ran on for two minutes:

```
Using TypeScript 5.9.3 (local user-provided)
api/[...path].ts(69,16): error TS2591: Cannot find name 'process'.
api/_internal/signature.ts(1,45): error TS2307: Cannot find module 'node:crypto'.
../../packages/env/src/env.ts(21,48): error TS2591: Cannot find name 'process'.
...
```

A directory named `api/` is the platform's own trigger. It compiled every file
there as a function **in addition** to the output the build command had already
produced — with its own TypeScript configuration, which has no Node types, and
its own resolution, which is the thing 0016 exists to stop depending on. Two
minutes, a wall of errors that are not errors in this repository, and a second
function beside the one we bundled.

The same build surfaced a second problem, in a warning rather than an error:

```
Warning - the following environment variables are set on your Vercel project,
but missing from "turbo.json". These variables WILL NOT be available to your
application:
  - VITE_API_TOKEN
```

`VITE_API_TOKEN` is inlined into the client at build time. Turbo passes a task
only the environment it declares, so the variable was set on the project,
absent from the build, and the client would have refused to start — correctly,
and for a reason nobody would have guessed from the deployment's own settings
page, where the variable is plainly there.

## Decision

**The routes live in `apps/auteur-web/server/`.** The entry is
`server/entry.ts`; the function's route is declared by the output directory
name, `functions/api/[...path].func`, which is the only place it needs saying.
No directory in this repository is named `api/`, so nothing triggers a build we
did not ask for.

**`turbo.json`'s `build` task declares `env: ["VITE_*"]`.** That both makes the
variable available and puts it in the cache key, which is the honest answer:
a build with a different token is a different build.

**`maxDuration` moves into `build-vercel.ts`.** With the Build Output API the
platform reads it from the generated `.vc-config.json`; a `functions` entry in
`vercel.json` would be a second number, matching no source file and read by
nobody. `vercel.json` keeps the two commands and the schedule.

## What was rejected

**A `.vercelignore` excluding `api/`.** It excludes files from the upload, and
the build needs the routes to bundle them — the one thing that must not be
excluded.

**Leaving `api/` and accepting the extra build.** Two minutes of every deploy,
a second function of unknown behaviour deployed beside the real one, and a log
whose loudest content is errors that mean nothing.

## Consequences

- `deploy-readiness.test.ts` asserts there is no `api/` directory for the
  zero-config builder to find, and that `server/entry.ts` is there instead.
- The `_` prefix on `server/_app.ts`, `_routes/`, `_internal/` and `_stages/`
  no longer means anything: it existed so the platform would not treat those
  modules as functions, and the platform no longer looks. Left as it is — the
  rename would touch every import in the API for no behavioural gain.
- `//#test:unit`'s inputs follow `vercel.json` to its new home, so a change to
  it still invalidates the suite that reads it.
