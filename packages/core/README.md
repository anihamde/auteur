# @auteur/core

Domain types and their zod schemas. Zero I/O, split by area so concurrent work never shares a file.

Layer: `foundation`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/ids`, `zod`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/core
```
