# 0020 — The schedule is declared once

**Status:** accepted · **Date:** 2026-09-09 · **Work package:** deploy readiness
· **Amends:** [0016](0016-the-build-produces-the-deployment.md)

## Context

Two things were wrong at once, and the second was hidden by the first.

**A project-level Output Directory.** The project carried an override,
`apps/auteur-web/dist`, from the day it was created — when the root directory
was the repository. With the root directory now the app, the platform looked
for `apps/auteur-web/apps/auteur-web/dist`, did not find it, and failed the
deployment *after* a clean build, with an empty error panel. `vercel.json`'s
own `outputDirectory` had been masking it until decision 0016 removed it.

That is why four rounds of reasoning about the output shape produced four
silent rejections: the output was never the problem. What established it was
running `vercel deploy --prebuilt` from a laptop against the same output — it
deployed in seven seconds and answered `{"ok":true}`. That split "is the
artifact valid" from "does the platform's build path work", and only the second
was ever broken.

**A duplicated cron.** With the overrides off, the deployment finally reported
something:

> A duplicated cron job with the same schedule (`0 4 * * *`) and path
> (`/api/internal/cron/sweep`) was found. Please remove the duplicated entry.

The platform reads `vercel.json` **and** the generated `config.json`. The same
entry in both is not merged; it is rejected.

## Decision

**The schedule lives in `build-vercel.ts`**, beside `MAX_DURATION` and for the
same reason: the generated config is what the deployment reads, so it is what
gets to say it. `vercel.json` is down to two commands — a build and an install.

**Its path is checked against the contract from the app's tests**, not from the
script. The script cannot import `@auteur/api-contract`: workspace packages are
linked into the package that depends on them, never the repository root
(decision 0015). So `deploy.test.ts` asserts
`specOf("internalSweep").path === CRONS[0].path`, and also that `vercel.json`
carries no `crons` at all — the duplicate is the failure mode, so its absence
is the thing worth asserting.

## What was rejected

**Keeping the schedule in `vercel.json` and reading it in the script.** That is
what was there, and it is exactly the shape that produced the duplicate: the
file the script reads is also a file the platform reads.

## Consequences

- `vercel.json` is two commands. Everything else the deployment needs is
  generated and tested.
- `docs/DEPLOY.md` says to leave the Framework Settings overrides off, and why.
- The failure to recognise, recorded once more: a deployment that fails after
  `Build Completed` with an empty panel is not the build. Run
  `vercel deploy --prebuilt` against the same output from a laptop — if that
  succeeds, the artifact is fine and the project's settings are not.
