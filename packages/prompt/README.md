# @auteur/prompt

Every prompt, assembled purely. No I/O, snapshot-tested.

Layer: `agent`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/core`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/prompt
```
