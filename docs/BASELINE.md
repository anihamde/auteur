# Baseline

`PRD.md` §10's five measures, with their sources. **Not yet recorded**: every
number here needs one real end-to-end run, which needs a Ramp Router key, a
Neon database and network egress — none of which the build environment has
(`docs/IMPLEMENTATION-PLAN.md` §4).

This file exists now, empty and honest, rather than after the run, because the
shape of the table is a decision and the numbers are not. A baseline written
after the fact tends to record the measures that looked good.

## How each is measured

| Measure | Target (`PRD.md` §10) | Source | Command |
|---|---|---|---|
| Style fidelity | the report's measures inside the corpus bands | `style-fit`'s `FitMeasure[]` on a finished draft | the result screen's fit tab, or `artifacts.kind = 'report'` |
| Completion | ≥ 70% of started sessions reach a finished story | `sessions` and the first `stage_delta` of `draft` | `bun run stats` |
| Time to draft | median under 4 minutes, idea to first prose token | `stage_runs.started_at` on `corpus-select` → first `stage_delta` of `draft` | `bun run stats` |
| Cost | median story under $0.15 | `SUM(stage_runs.cost_micros)`, computed at write time | `bun run stats` |
| Blind discrimination | judge picks the real passage ≤ 70% of the time | held-out passages the card did not use | `bun scripts/discrimination.ts <cardId>` |

Two of the five are already asserted in tests against seeded data — completion
and time-to-draft are computed by `scripts/stats.ts`, and both are checked
against hand-computed values in `apps/auteur-web/tests/integration/stats.test.ts`.
What is missing is a run to point them at.

## WP-X1 — the real run

1. `bun run preflight` — every variable present and valid.
2. `bun run verify:live` — the four checks of `docs/IMPLEMENTATION-PLAN.md`
   §5.4. **A failure here is not a reason to continue**: it means a declared
   value was wrong, and the numbers below would be measuring something else.
3. One flash story, end to end, from the idea screen.
4. `bun run stats` and `bun scripts/discrimination.ts`.
5. Fill in the table below.

**A missed target is recorded as a number and a stage, never smoothed.** The
point of writing that down before the run is that it is easy to agree with
beforehand and hard to honour afterwards.

| Measure | Target | Measured | Verdict | Where it went |
|---|---|---|---|---|
| Style fidelity | inside the bands | — | — | — |
| Completion | ≥ 70% | — | — | — |
| Time to draft | < 4 min | — | — | — |
| Cost | < $0.15 | — | — | — |
| Discrimination | ≤ 70% | — | — | — |

## WP-X2 — the tier experiment

`docs/IMPLEMENTATION-PLAN.md` §5.2 states the stage-to-tier assignment as a
hypothesis, and this is the experiment that tests it. Two config edits to
`packages/config/src/tiers.ts`, one run each, and the deltas recorded:

| Change | Style fidelity Δ | Cost Δ | Kept? |
|---|---|---|---|
| `style-extract` at `strong` | — | — | — |
| `critique` at `balanced` | — | — | — |

Whatever it shows becomes a decision file, including "no measurable
difference" — which is the result that most deserves writing down, because it
is the one that would otherwise be re-litigated every few months.
