# @auteur/dependency-min-age

CI gate 9: refuse a catalog version published inside the release-age window.

Layer: `tooling`. It may import packages in its own layer or below, never above.

## Dependencies

`zod`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/dependency-min-age
```
