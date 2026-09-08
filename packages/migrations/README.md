# @auteur/migrations

The ordered SQL ledger and the runner that applies it on access.

Layer: `infra`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/db`, `@auteur/errors`, `@auteur/logger`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/migrations
```
