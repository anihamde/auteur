# @auteur/db

Postgres connection handling, pooled and direct, and SQL primitives. Knows no domain.

Layer: `infra`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/env`, `@auteur/errors`, `@auteur/logger`, `pg`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/db
```
