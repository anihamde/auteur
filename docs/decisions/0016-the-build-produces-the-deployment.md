# 0016 — The build produces the deployment

**Status:** accepted · **Date:** 2026-09-09 · **Work package:** deploy readiness
· **Amends:** [0015](0015-the-deployment-root-is-the-app.md)

## Context

With the deployment root set to the app, the function was found, compiled, and
crashed:

```
Error [ERR_MODULE_NOT_FOUND]:
  Cannot find module '/var/task/apps/auteur-web/node_modules/@auteur/api-contract/src/contract.ts'
  imported from /var/task/apps/auteur-web/api/[...path].js
```

The platform's zero-configuration builder compiled `[...path].ts` to
`[...path].js` and left `@auteur/api-contract` as a bare specifier for Node to
resolve at runtime — which is right for an ordinary dependency, and wrong for
ours: **our workspace packages export TypeScript source.** `@auteur/api-contract`
resolves to `src/contract.ts`, and Node cannot import a `.ts` file.

This is not a setting. A builder that treats `node_modules` as already-built
JavaScript and packages that export source cannot both be right, and the
packages exporting source is a decision this repository has made everywhere.

Three deploys failed before this one, each on a different guess about how the
platform finds and builds a function. What they had in common is that the first
evidence arrived after a push.

## Decision

**`bun run build:vercel` emits `.vercel/output` — the Build Output API.**

```
.vercel/output/
  config.json                      version, crons
  static/**                        the client bundle, verbatim
  functions/api/[...path].func/    index.mjs + .vc-config.json
```

The function is **one file with everything bundled into it**: workspace
packages, `hono`, `zod`, `pg`. Nothing is resolved at runtime, so nothing
depends on what a builder decides `node_modules` means.

**`vercel.json` stays the source of the schedule and the duration**, and the
script reads them into the generated config rather than restating them.

**`@hono/node-server` adapts the app to the runtime.** Hono speaks
`Request`/`Response`; the Node launcher hands a handler `(req, res)`. Writing
that adapter by hand is forty lines, most of them about streaming a response
body that never ends — which is exactly what the events route is.

**The artifact is tested by running it.** `bundle.test.ts` builds the function,
starts it under **Node** in a child process, and asks it for three things
against an **empty** database. Every other suite here imports source and runs
under Bun; each of those three differences has already produced a failure no
source-level test could see:

- a workspace package exporting `.ts` that Node cannot import,
- a Bun global that does not exist on Node (gate 16),
- an advisory lock taken on a pooled handle, which cannot hold one — found by
  this test on its first run, before it was a test.

## What was rejected

**Making the packages emit JavaScript.** Thirty-seven packages gain a build
step and a `dist/`, so that one deployment target can read them. The gates that
compare the manifest against what is on disk would all have to learn about
generated output.

**Importing the packages by relative path from `api/`.** The builder would
inline them, and `gate 5` exists to stop exactly that: a workspace dependency
is a declared edge, not a path.

**Another guess at the project settings.** There was no reason to think the
fourth would land where three had not, and every attempt costs a push, a build,
and a request to find out.

## Consequences

- `vercel.json` no longer names an `outputDirectory`: `.vercel/output` is the
  output, and a second statement of it would be the one the platform ignores.
- `ensureSchema` now takes the handle to migrate with separately from the one
  it reads on. The fast path is a single statement and belongs on the pooled
  handle every route uses; the lock needs a direct one.
- `createTestDb({ migrate: false })` exists for the one suite whose subject is
  the schema arriving on first request.
- The bundle is ~1.5 MB and rebuilt on every deploy. It is one file, and the
  cold start reads one file.
