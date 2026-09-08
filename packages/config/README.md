# @auteur/config

Configuration as data: the tier candidate lists and the stage-to-tier map.

Layer: `foundation`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/core`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/config
```
