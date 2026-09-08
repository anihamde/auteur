# @auteur/api-contract

One zod source of truth for every route.

Layer: `api`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/core`, `@auteur/errors`, `zod`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/api-contract
```
