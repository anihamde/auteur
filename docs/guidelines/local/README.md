# Repository-specific guidelines

Guidelines authored in this repository. They are **not** part of the seed from
`agent-guidelines` and are never overwritten when the seed is refreshed.

Use the same front matter as a seeded guideline:

```yaml
---
id: sql-style
title: SQL style
covers: Query formatting and naming for this schema
tier: if-touched
trigger: You write or modify a SQL query.
overrides: [database]
---
```

- `tier` is `always`, `if-touched`, or `reference`.
- `trigger` is required for `if-touched` and forbidden otherwise.
- `overrides` lists the seeded guideline ids this doc supersedes. Include it
  whenever the doc contradicts the seed, and say in the body what changed and
  why.

Add the doc to the table under "Repository-specific guidelines" in the root
`AGENTS.md` so it is discoverable.

Write one when a rule is real for this codebase and would not generalize.
Do not write one to restate a seeded rule.
