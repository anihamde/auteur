# @auteur/corpus-gutenberg

gutendex client, text fetch, work and passage selection.

Layer: `service`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/core`, `@auteur/corpus-store`, `@auteur/errors`, `@auteur/ids`, `@auteur/logger`, `@auteur/text`, `zod`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/corpus-gutenberg
```
