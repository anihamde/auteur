# @auteur/pipeline

Stage graph, tier resolution, one-stage execution, streaming and usage accounting.

Layer: `agent`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/config`, `@auteur/core`, `@auteur/errors`, `@auteur/event-store`, `@auteur/ids`, `@auteur/logger`, `@auteur/model-provider`, `@auteur/prompt`, `@auteur/prosody`, `@auteur/session-store`, `@auteur/stage-queue`, `@auteur/style-card`, `@auteur/style-fit`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/pipeline
```
