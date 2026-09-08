# @auteur/copy

Every user-facing string, one module per screen, with the content rules asserted by test.

Layer: `foundation`. It may import packages in its own layer or below, never above.

## Dependencies

None.

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/copy
```
