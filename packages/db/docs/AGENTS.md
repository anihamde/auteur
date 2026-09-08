---
package: packages/db
promotes:
  always: [database]
---

# AGENTS — `@auteur/db`

Addendum for this package. It does not relist root rules; assume the root
[`AGENTS.md`](../../../AGENTS.md) is already loaded. On conflict, this file
wins.

## Package rules

**This package knows no domain.** No table name, no column name, no zod schema
from `@auteur/core`. It is `pg` connection handling and SQL primitives; the
moment it knows what a session is, every store has two places to look.

**There is no query builder here and there will not be one.** An ORM hides the
query that actually runs, so the plan, the index usage and the round-trip count
all become invisible at the call site. A thin typed client is welcome; a builder
is not.

**The pooled/direct distinction is enforced, not documented.** A pooled handle
refuses `transaction()` and `connect()`. A pooled connection hands each
statement to whichever backend is free, so `BEGIN` and `COMMIT` can land on
different ones and a `LISTEN` is accepted and then never delivers. Both are
silent at run time; the refusal makes them loud.

**`identifier()` and `columns()` refuse rather than escape.** Escaping invites a
caller to pass user input; refusing means the only values that reach them are
ones written in the source. They are the two interpolations gate 13 permits.
