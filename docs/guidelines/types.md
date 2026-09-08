---
id: types
title: Types
covers: Strict compiler settings, no `any`, no `as`, and types that exclude bad states
tier: always
---

# Types

## Compiler settings

`tsconfig.json` runs with, at minimum:

```jsonc
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "verbatimModuleSyntax": true
}
```

No per-file relaxation. A package that cannot compile under these settings gets
fixed, not exempted.

## Never `any`

`any` disables the checker for everything it touches, silently and
transitively. If a value's shape is genuinely unknown, type it `unknown` and
narrow it.

## Never `as`

A type assertion is a claim the compiler cannot check. It is the single most
common cause of a runtime shape error in a strictly typed codebase.

```ts
// wrong — nothing verified this
const config = JSON.parse(raw) as Config;

// right — parsed and verified
const config = configSchema.parse(JSON.parse(raw));
```

The narrow exceptions: `as const`, and a cast immediately adjacent to a runtime
check that proves it, with a comment saying what proves it. Everything else —
especially data crossing a boundary — is parsed. See
[data-boundaries](./data-boundaries.md).

`!` (non-null assertion) is the same rule. Narrow instead.

## Make illegal states unrepresentable

Prefer a type that cannot express a bad combination over a type that can plus a
check that it doesn't.

```ts
// wrong — four states exist, two are nonsense
type Request = { loading: boolean; data?: User; error?: Error };

// right — exactly three states exist
type Request =
  | { kind: RequestState.Loading }
  | { kind: RequestState.Loaded; data: User }
  | { kind: RequestState.Failed; error: Error };
```

This is the type-level form of the offensive-coding rule in
[errors](./errors.md): when the type forbids the case, no defensive guard is
needed. See [discriminated-unions](./discriminated-unions.md) for the shape
these take.

## Prefer `type` to `interface`

Use `type` aliases by default: they compose, they support unions, and they do
not merge across declarations. Reach for `interface` only when you need
declaration merging to extend a third-party type.

## Derive, don't duplicate

When one type is a function of another, derive it — `ReturnType`, `Parameters`,
`keyof`, indexed access, `satisfies`. A hand-copied type drifts on the first
refactor that touches only one of them.

## Type the boundary, not every intermediate

Annotate exported signatures and anything crossing a module edge. Inside a
function, let inference work — restating an inferred local type adds noise and
another thing to keep in sync.
