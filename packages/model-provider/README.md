# @auteur/model-provider

The provider-neutral model contract and the registry.

Layer: `agent`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/core`, `@auteur/errors`, `zod`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/model-provider
```
