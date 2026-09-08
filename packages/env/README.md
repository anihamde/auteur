# @auteur/env

Parse-and-fail-fast environment access, one schema.

Layer: `foundation`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/errors`, `zod`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/env
```
