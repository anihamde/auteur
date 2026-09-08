---
package: packages/migrations
promotes:
  always: [database, migrations]
---

# AGENTS — `@auteur/migrations`

Addendum for this package. It does not relist root rules; assume the root
[`AGENTS.md`](../../../AGENTS.md) is already loaded. On conflict, this file
wins.

## Promoted guidelines

`database` and `migrations` are `IF TOUCHED` at the root, which is right for a
repository where most packages touch neither. Here every change touches both.

## Package rules

**Never edit an applied migration.** The checksum is verified on every boot and
a mismatch aborts, so an edit does not silently diverge — it stops the
application. Roll forward with a new migration instead. `bun run migration:new`
scaffolds one and applies nothing.

**The manifest is generated and committed.** `src/generated/manifest.ts` inlines
every `.sql` file with its checksum. A bundled function ships no arbitrary
files, so a runtime `readdir` finds zero migrations and `ensureSchema()`
cheerfully reports the database up to date — the worst failure this package has,
and one nexus actually shipped. Run `bun run build` and commit the result; gate
14 fails a manifest behind its files.

**Expand before contract, one rewrite-`ALTER` per table per file.** A deploy
replaces functions while earlier invocations are still finishing, so the
migration that drops or renames what a new column replaces is a *later* file.
Gate 14 fails a file that does both.

**This package's suites create their own database.** `@auteur/test-db` exists to
apply these migrations, so devDepending on it would be a cycle — and these
suites want database states that harness deliberately never produces, above all
an empty one. See `tests/integration/harness.ts`.
