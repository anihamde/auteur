# @auteur/prosody

The deterministic metrics over text's output. No I/O, no model, no clock.

Layer: `foundation`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/core`, `@auteur/text`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/prosody
```
