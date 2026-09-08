---
id: migrations
title: Migrations
covers: The server converges the schema on access; migrations are never applied by hand
tier: if-touched
trigger: "You change the database schema, or add a migration."
---

# Migrations

## The server applies migrations, not a person

The application checks the database's schema state when it accesses it and
applies whatever migrations are outstanding. Nobody runs a migration by hand,
in any environment, and no deploy step exists whose job is to migrate.

This means:

- **Never run DDL against a database manually** — not in production, not in
  staging, not to "just fix" a column locally. The recorded state and the real
  schema must never diverge, and a hand-applied change makes them diverge
  silently.
- **A schema change is a committed migration file.** That file is the only
  mechanism.
- **Migrations are append-only.** Once a migration has run anywhere, it is
  immutable. To change its effect, add a new migration.
- The convergence step is idempotent and concurrency-safe: several instances
  booting at once must not double-apply. Take an advisory lock around the
  check-and-apply.

## Writing a migration

- One logical change per migration, with a monotonic ordering and a name that
  says what it does.
- Plain SQL. The same no-ORM rule applies — see [database](./database.md).
- Forward-only. Do not write a `down` migration you will never run; recovery
  from a bad migration is a new forward migration.
- Deterministic: no `now()`-dependent branching, no reading application config.

## Expand, migrate, contract

Old and new application code run simultaneously during a deploy. A migration
that breaks the running version takes the site down.

Ship a breaking change in three steps, each its own deploy:

1. **Expand.** Add the new column, table, or index. Nullable or defaulted, so
   existing writes keep working. Add the index concurrently.
2. **Migrate.** Deploy code that writes both shapes and reads the new one.
   Backfill existing rows in batches, not one statement over the whole table.
3. **Contract.** Once nothing reads or writes the old shape, drop it in a later
   migration.

Never rename a column in one step — that is an expand/contract in disguise.

## Locking

A migration that takes a long lock on a large table is an outage.

- Add indexes with `CREATE INDEX CONCURRENTLY`.
- Adding a `NOT NULL` column with a default, or a check constraint, rewrites or
  scans the table. Add it nullable, backfill in batches, then add the
  constraint as `NOT VALID` and validate it separately.
- Set a short `lock_timeout` so a migration that cannot get its lock fails fast
  instead of queueing every query behind it.

## Testing

A migration is code and gets the same discipline as code — see
[testing](./testing.md). Test that it applies to a database at the previous
version, that the convergence check is idempotent when run twice, and that a
backfill produces the expected rows.
