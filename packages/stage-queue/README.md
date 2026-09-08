# @auteur/stage-queue

The durable stage chain: enqueue, claim, complete, and the sweep query.

Layer: `store`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/core`, `@auteur/db`, `@auteur/errors`, `@auteur/ids`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/stage-queue
```
