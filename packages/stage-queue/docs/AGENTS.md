---
package: packages/stage-queue
promotes:
  always: [database]
---

# AGENTS — `@auteur/stage-queue`

Addendum for this package. It does not relist root rules; assume the root
[`AGENTS.md`](../../../AGENTS.md) is already loaded. On conflict, this file
wins.

## Package rules

**Every test here is an integration test against a real Postgres.** There is no
mocked database anywhere in `packages/` — if a test needs one, the test is
wrong. This store's guarantees are guarantees *of Postgres*: a unique
constraint, a conditional update that either claims a row or does not, a foreign
key that cascades. A mock asserts that the code called the mock.

`@auteur/test-db` gives each suite its own database, and
`scripts/test-postgres.ts` starts a server if one is not already configured.
No server available is a failure, never a skip.

**Return domain types, not rows.** The snake_case row shape stops at this
package's boundary. A caller that saw `session_id` would be a caller coupled to
the schema.
