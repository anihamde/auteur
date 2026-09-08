# @auteur/export

Markdown export, and the label no export can omit.

Layer: `service`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/core`, `@auteur/copy`, `@auteur/errors`, `@auteur/formatting`, `@auteur/style-fit`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/export
```
