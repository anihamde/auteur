# @auteur/corpus-gutenberg

Project Gutenberg text fetch and cleaning, work and passage selection.

Layer: `service`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/core`, `@auteur/corpus-store`, `@auteur/errors`, `@auteur/ids`, `@auteur/logger`, `@auteur/text`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/corpus-gutenberg
```
