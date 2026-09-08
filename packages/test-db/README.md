# @auteur/test-db

An ephemeral Postgres per test run, migrated by the real runner, with a deterministic fixture.

Layer: `test`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/db`, `@auteur/ids`, `@auteur/migrations`, `pg`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/test-db
```
