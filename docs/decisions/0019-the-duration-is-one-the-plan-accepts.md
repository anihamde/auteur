# 0019 — The duration is one the plan accepts

**Status:** accepted · **Date:** 2026-09-09 · **Work package:** deploy readiness
· **Amends:** [0016](0016-the-build-produces-the-deployment.md)

## Context

Two deployments in a row: clean build, `Deploying outputs...`, failed, empty
error panel, nothing in the log after that line. Adding `routes` to the output
(decision 0018) did not change it.

Guessing had cost three rounds, so this one was settled with the platform's own
builder instead. Installing the same CLI version the deployment runs, pointing
it at this app, and giving it a local `project.json`:

```
{ "status": "ok", "outputDir": ".../apps/auteur-web/.vercel/output" }
```

The build side is fine. Then the same CLI was asked to build a trivial project
with one ordinary function, and its generated `.vc-config.json` read back as
the reference to diff against. One field in ours can be refused by a plan:

```json
"maxDuration": 300
```

The plan this deploys on caps a function at 60 seconds — the same cap that
refused the every-minute cron with a message. Here there is no message,
because the build did not fail; the upload did.

## Decision

**`MAX_DURATION` is 60.** It bounds one stage, not a run: the chain's design is
that no invocation waits for another, so a stage that needs longer than a
minute is a stage to split rather than a limit to raise. Raise it here if the
plan changes.

**The rest of `.vc-config.json` is shaped like one the platform generates**, so
the field set is a superset of a known-good one rather than a set we invented:
`architecture`, `environment`, `awsLambdaHandler`,
`shouldDisableAutomaticFetchInstrumentation` and `shouldAddSourcemapSupport`
are the CLI's own, and `maxDuration` and `supportsResponseStreaming` are the
two this function needs.

`shouldAddHelpers` stays false. The helpers give a bare handler `req.body` by
reading the body first, and the handler here is a request listener that must be
given it unread.

## What was rejected

**Another guess.** Three rounds of reasoning about the output shape produced
three silent rejections. The CLI is on npm, the registry is reachable, and a
reference output takes two minutes to generate.

**Dropping `supportsResponseStreaming` to reduce the surface.** It is
documented, and without it the events route buffers — an SSE body that never
ends, delivered when the run is over.

## Consequences

- `build-vercel.test.ts` asserts the duration is a positive integer within the
  plan's ceiling, so raising it is a deliberate edit rather than a typo.
- `docs/DEPLOY.md` records the failure's shape: a deployment that fails after
  `Build Completed` with an empty panel is the output being rejected, and the
  build log will never say so.
- A stage now has 60 seconds. If a model call for a long preset exceeds that,
  the sweep re-invokes it — and the fix is to split the stage, not to raise the
  ceiling.
