# 0012 — The functions run on Node

**Status:** accepted · **Date:** 2026-09-09 · **Work package:** deploy readiness

## Context

Bun is the toolchain: the package manager, the test runner, every script, the
local dev server. It is not the runtime. Vercel executes functions on Node, so
`Bun.CryptoHasher`, `Bun.hash`, `Bun.env` and `Bun.sleep` — all of which the
code used on the request path — are `Bun is not defined` on the deployment and
correct everywhere else.

There is no local symptom of this at all. `turbo test` is green because tests
run under Bun. `turbo build` is green because the functions are not bundled by
the build that checks them. The first evidence would have been a deployment
that answers 500 to every request, including `/api/health`.

The defect had spread through four packages by the time it was found —
`@auteur/env`, `@auteur/text`, `@auteur/prosody`, `@auteur/style-card` — none
of which look like request-path code from inside their own package.

## Decision

Nothing reachable from a function entry point uses a Bun global, and
**gate 16** enforces it by walking the import graph from
`apps/auteur-web/api/[...path].ts` and `api/_app.ts`, resolving `@auteur/*`
through the package manifest.

The replacements are the Node standard library: `node:crypto`'s `createHash`,
`createHmac` and `timingSafeEqual`; `process.env`; a `setTimeout` promise.

**A graph walk, not a repository-wide ban.** A Bun global in a script or a test
is correct — this repository is a Bun repository. A rule that forbade `Bun.` in
every file would be a rule that gets suppressed at the first script that needs
it, and a suppressed rule stops being a gate. Reachability is the actual
predicate: the question is not whether a file uses Bun but whether a function
loads that file.

**A missing entry point is a failure, not an empty graph.** A check that reads
files and skips the ones it cannot open passes vacuously the day someone
renames the catch-all. The walk asserts each entry exists before it starts.

## What was rejected

**Bun's Node compatibility as the argument for leaving it alone.** It runs
Node's API surface under Bun. It does not put Bun's API surface on Node, which
is the direction that matters here.

**A runtime shim providing `Bun` on Node.** It would make the defect invisible
rather than absent, and every future use would be one more call to keep
compatible.

**Testing for it at runtime.** A smoke test against a live deployment finds
this, and finds it after the deploy, once per occurrence. The gate finds the
class before the push.

## Consequences

- `scripts/check-node-runtime.ts` is gate 16, with a `gate-self-test.ts` case
  that reintroduces `Bun.env` into `@auteur/env` — a package reached through a
  workspace import, which is the shape the real defect took.
- `packages/env` reads `process.env` by default, so the same code reads
  configuration under Bun and under Node.
- Anything added to the request path is subject to the walk. A package that
  needs a Bun API stays off the serverless path or grows a Node implementation.
