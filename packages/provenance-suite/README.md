# @auteur/provenance-suite

CI gate 8: invariant 2, as a build gate rather than a habit.

Layer: `test`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/core`, `@auteur/export`, `@auteur/pipeline`, `@auteur/style-card`, `@auteur/style-fit`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/provenance-suite
```
