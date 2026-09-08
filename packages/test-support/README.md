# @auteur/test-support

happy-dom preload, a styled render, the axe audit, and the scripted provider.

Layer: `test`. It may import packages in its own layer or below, never above.

## Dependencies

`@auteur/core`, `@auteur/model-provider`, `@auteur/tokens`, `@happy-dom/global-registrator`, `@testing-library/react`, `axe-core`

## Public surface

See `api-surface.md`, which CI regenerates and compares on every pull request.

## Testing

```sh
bun run turbo test --filter @auteur/test-support
```
