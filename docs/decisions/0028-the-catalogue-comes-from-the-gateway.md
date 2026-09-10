# 0028 — The catalogue comes from the gateway

**Status:** accepted · **Date:** 2026-09-10 · **Work package:** deploy readiness

## Context

The first model call this product ever made, on the first real session, answered
404:

```
{"error":{"message":"The model `claude-haiku-4.5` does not exist or you do not
have access to it.","type":"invalid_request_error","param":"model",
"code":"model_not_found"}}
```

It reached a reader as `model_unavailable` — "The model this stage runs on is
not available." — after `corpus-select` had already read the catalogue, chosen
its works and emitted its detail line. Everything before the model call worked.

**Not one id in the table was one the gateway serves.** The catalogue named
`claude-haiku-4.5`, `gpt-5`, `claude-sonnet-4.5`, `claude-opus-4.1`, `grok-4`,
`qwen3-30b-a3b`, `deepseek-v3.2`, `glm-4.6-air`, `kimi-k2-0905`. The gateway
serves `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`,
`claude-fable-5-1`, `gpt-6-astra`, `gpt-5.6-*`, `grok-4.6`, `kimi-k3`,
`deepseek-v4-*`, `glm-5p3`. A generation apart, and `claude-haiku-4.5` was
never a valid id anywhere — the real one has hyphens.

Three things had to be true at once for that to survive to production.

**The premise was wrong.** `models.ts` said, at length, that the gateway's model
list "is the OpenAI model-list shape and carries no context window, no max
output, no structured-output support and no price — so it can **filter** this
list … and it could never build it." That is true of the OpenAI specification.
It is not true of this gateway, whose every entry carries a `router` block with
`limits`, `capabilities` and `pricing`. The whole hand-written table existed to
work around a limitation the gateway does not have.

**The check was half-written.** `scripts/check-router-catalogue.ts` has a
`compare()` function that returns exactly the drift above, with tests. Nothing
ever called the gateway. For the life of the project it reported on a catalogue
and never on the difference between it and reality — a comparison with one side
missing, which is not a weak check but the *shape* of one, and reads like a
check that works.

**The honesty mechanism pointed the wrong way.** Every row was tagged
`source: "declared"` and a test asserted that no row had ever been tagged
`measured`, so that "a declared table is not quietly mistaken for a verified
one". That test passed every day of a catalogue in which nothing was real.
Declaring was never the problem; not asking was.

## Decision

**`bun run catalogue:models` generates the catalogue from the gateway.** It
fetches `/v1/models`, parses the `router` block, and writes
`packages/provider-router/src/generated/catalogue.ts`. The file is committed:
the deployment never depends on a live call, and a refresh is a diff somebody
reads.

**Every row is `measured`, because it was.** The test that asserted the
opposite is inverted — it now fails on a row that is *not* measured, which is a
row somebody typed.

**Prices convert without ever constructing a float.** The gateway sends decimal
strings; `1.1 * 1e6` is `1100000.0000000002`, and `pricing.ts` uses integer
micros precisely so a hundred stages do not drift in the last place. The string
is split and padded instead.

**Deprecated models are dropped.** The gateway still answers for them and will
not for ever, and a row here is a model a session can be pinned to. Seven of the
sixty-eight go.

**`check-router-catalogue.ts` asks.** With a key it reports three things and
exits non-zero on any of them: a catalogue row the gateway no longer serves, a
model the gateway serves that the generated file has not got, and — the one that
took the product down — **a tier candidate that is in neither**. Without a key
it fails and says so, because not checking is not the same as passing.

**Both sides of that comparison apply the same rule**, which is why dropping
deprecated models is one exported function rather than a `filter` in two
places. The first version filtered only the catalogue side and was therefore red
on the day it was written — seven deprecated models reported missing, with a
remedy ("re-run the generator") that drops them again. A check that cannot pass
is a check nobody runs twice.

**`verify:live`'s first sub-report is this check.** It used to print that the
measurement half of the gateway probe was unwritten and every row was tagged
`declared`. Both were true, and neither was the problem: the catalogue named
models the gateway had never served, and the one thing that would have said so
never called it.

**The schema describes what is read and ignores the rest.** Decision 0022's
rule, applied to a second upstream: the `router` block carries modalities,
reasoning efforts and verbosity, and describing them would only add ways for a
refresh to fail on a field nothing reads.

## What was rejected

**Correcting the ids by hand.** It fixes today's 404 and re-creates the
condition exactly: a table that is right until the gateway changes, with nothing
that would notice. The ids were only the visible half — every context window,
output ceiling and price was equally unverified.

**Fetching the catalogue at run time.** It removes the committed file and with
it the property that the deployment boots without a third party. A model list
that changes without a diff is a pipeline whose model assignments change without
review.

**Keeping `source` as a column.** It is `measured` on every row now, so it looks
redundant — and it is the thing that fails loudly if a row is ever added by
hand.

## Consequences

- Sixty-one rows, from `claude-opus-5` at $5/$25 to `gpt-5-nano` at $0.05/$0.40,
  with real context windows and output ceilings.
- `TIER_CANDIDATES` names ids that exist. `claude-opus-5` leads `strong`,
  `claude-sonnet-5` leads `balanced`, `claude-haiku-4-5` leads `cheap`, and
  every candidate accepts a strict schema — six of the ten stages are typed.
- `verify:live`'s first sub-report, unwritten since the beginning, is now a
  script that runs.
