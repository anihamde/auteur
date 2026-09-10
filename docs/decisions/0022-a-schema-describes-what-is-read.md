# 0022 — A schema describes what is read

**Status:** accepted · **Date:** 2026-09-10 · **Work package:** deploy readiness

## Context

Every author search on the deployment returned "gutenberg unavailable". The
reason, once `verify:live` was made to actually run its check:

```
✖ Unrecognized key: "editors"
  → at results[0]
```

Gutendex added a field. The response was otherwise exactly what the schema
described, and the product stopped working.

`schema.ts` chose `.strict()` deliberately, and said why:

> Ignoring the extra is how a renamed field becomes `undefined` and a card gets
> built from nothing.

That reasoning is wrong, and the error message shows how. A rename is an
**absence**: the old key is gone, and the schema requires it, so the parse
fails naming the field whether or not unknown keys are rejected. Strictness
adds failure on exactly one case — a field being *added* — which is the one
case that is not a breaking change.

The schema also required seven fields nothing reads: `bookshelves`,
`copyright`, `download_count`, `languages`, `media_type`, `subjects`,
`summaries`. Any of them being tidied away upstream would have taken the
product down for a value nothing asks for.

## Decision

**The schema describes the five fields this code reads** — `authors`,
`translators`, `formats`, `id`, `title` — and nothing else. Unknown keys are
stripped rather than rejected.

The rule that replaces `.strict()` draws the line where the risk is:

- **Every field the provider reads is required**, and nullable rather than
  optional where the value may genuinely be absent. An optional field with a
  wrong name parses happily and yields `undefined` on every row, which is
  indistinguishable from an author whose dates nobody recorded. This is
  unchanged, and it is what invariant 4 actually asks for.
- **Everything else is ignored**, and is not described at all. Another
  service's roadmap is not this product's outage.

## What was rejected

**Adding `editors` to the schema.** It fixes this response and waits for the
next field. The defect is the rule, not the row.

**Keeping `.strict()` behind a flag.** Two behaviours, one of which is only
ever chosen after an outage.

## Consequences

- `schema.test.ts` asserts the three cases separately: an unknown key is
  ignored, a read field going missing fails naming it, and an unread field
  going missing does not.
- `probe-gutendex.test.ts` asserts that a payload carrying `editors` and an
  invented field parses.
- `GutendexBook` is five fields, so the fixtures are five fields. A test that
  had to invent a `download_count` to construct a book was inventing evidence
  for a field nothing reads.
- The header no longer says "Unverified". It has now been checked against a
  live response — which is what `verify:live` is for, and it took making that
  script do what its own docstring claimed.
