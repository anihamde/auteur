# @auteur/stream-client

The browser half of the SSE stream: cursor, replay, reconnect.

Layer: `api`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/api-contract`, `@auteur/core`, `@auteur/errors`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/stream-client
```
