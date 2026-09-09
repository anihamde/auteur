# 0018 — The output says which URLs reach the function

**Status:** accepted · **Date:** 2026-09-09 · **Work package:** deploy readiness
· **Amends:** [0016](0016-the-build-produces-the-deployment.md)

## Context

A clean build, and then:

```
12:43:55.318 Build Completed in /vercel/output [7s]
12:43:55.444 Deploying outputs...
```

and the deployment is marked failed, with an empty error panel. Nothing after
"Deploying outputs". The output itself was rejected.

`.vercel/output/config.json` declared `version` and `crons` and nothing else. A
`.func` directory whose name carries a dynamic segment — ours is
`functions/api/[...path].func` — is not matched by that name alone; the output
has to say which URLs go to it, which is why every framework's generated output
carries a `routes` array. Without one, the deployment holds a function nothing
can reach, and the schedule names `/api/internal/cron/sweep`, which resolves to
nothing. A cron path that matches no route is checked at deploy time.

## Decision

`config.json` declares three routes, and the order is the whole of the
behaviour:

```json
[
  { "src": "^/api(?:/.*)?$", "dest": "/api/[...path]" },
  { "handle": "filesystem" },
  { "src": "/.*", "dest": "/index.html" }
]
```

**`/api/*` is claimed before `filesystem`**, so no static file can shadow a
route. **`filesystem` serves the client bundle.** **What is left gets
`index.html`** — a single-page app has one document, and a deep link that 404s
is the platform disagreeing with that.

## What was rejected

**Dropping the cron to make the deployment go through.** It would have
deployed, and the missing routes would still have been missing: every URL would
have reached `index.html` or a 404, and the function nothing at all. The cron
was the thing that reported the problem, not the problem.

**A non-dynamic function name with a rewrite to it.** It trades a documented
output shape for a question about whether the function still sees the URL the
caller asked for.

## Consequences

- `build-vercel.test.ts` checks the order and that the API pattern matches
  `/api/health` and the sweep's path and not `/assets/…`.
- The function directory name is built from one constant that the route's
  `dest` also uses, so the two cannot drift.
- A deploy that is rejected with no message is now a shape we have seen: the
  output is invalid, and the build log will not say so.
