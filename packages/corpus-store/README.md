# @auteur/corpus-store

The works and passages cache, keyed by source and cleaner version.

Layer: `store`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/core`, `@auteur/db`, `@auteur/errors`, `@auteur/ids`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/corpus-store
```
