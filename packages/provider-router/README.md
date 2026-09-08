# @auteur/provider-router

The Ramp Router adapter, speaking the Responses API statelessly.

Layer: `agent`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/core`, `@auteur/env`, `@auteur/errors`, `@auteur/logger`, `@auteur/model-provider`, `openai`, `zod`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/provider-router
```
