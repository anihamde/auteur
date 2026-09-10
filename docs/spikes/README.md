# Spike notes

Three questions the build could not answer, and the notes that will answer
them. Each is written by `bun run verify:live` (`docs/IMPLEMENTATION-PLAN.md`
§5.4), which needs a Ramp Router key and network egress — neither of which the
build environment had.

This directory exists now, holding the questions rather than the answers,
because a note written after the pass tends to record what the pass found and
lose what it was asked. What each note must contain is decided here, before
anyone knows the answer.

| Note | Question | Written by |
|---|---|---|
| `s1-router-capabilities.md` | Which catalogue rows' declared capabilities differ from the gateway's? Which models accept a strict schema? | `scripts/check-router-catalogue.ts`, `scripts/probe-router-responses.ts` |
| ~~`s2-gutendex-schema.md`~~ | **Answered, and the question dissolved.** A probe from inside a function found `gutendex.com` answering Cloudflare's managed challenge to every datacenter address, so the catalogue is imported into this database and nothing parses a gutendex response (decisions 0023 and 0025). `verify:live` checks that the import has landed instead. | — |
| `s3-latinate-precision.md` | What precision does the suffix classifier reach against the hand-labelled set, and does §4.3's 0.85 threshold keep it scored or demote it? | `scripts/score-latinate.ts` |

## What is provisional until they land

- **Every `CatalogueRow.source` is `"declared"`.** No row has been measured, and
  `scripts/check-router-catalogue.ts` fails if anything but the verification
  pass sets one to `"measured"`.
- **The tier candidate lists are ordered against those declared columns.**
  `packages/config/src/tiers.ts` says so in its own docstring: a corrected row
  changes what resolution picks with no edit there.
- **`latinateGate()` returns `{ scored: true, validated: false }`,** and every
  `FitMeasure` it produces carries `classifier: { validated: false }` so the UI
  reads "latinate ratio (suffix proxy, unvalidated)". A reader is never shown
  its verdict without being told what produced it.
- **`LISTEN`/`NOTIFY` is verified on stock Postgres and not on Neon.**
  `checkListenNotify` in `scripts/verify-live.ts` is the same function for both;
  §5.3's fallback, if it fails, is polling `events` on the cursor every 300ms —
  which costs latency and no architecture.

## The rule the pass follows

**It fails on any discrepancy rather than absorbing it.** A green run is
therefore a claim: every declared value was right. Anything it moves lands as
its own follow-up pull request — a catalogue correction, a schema correction,
or the one-line promotion of `latinateRatio` to a validated measure.
