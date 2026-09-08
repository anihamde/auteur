---
id: react
title: React
covers: Component structure, props, hooks, and the error-boundary contract
tier: if-touched
trigger: "You author or modify a component, a hook, or any JSX."
---

# React

## Components

Function components declared as `const` arrow expressions, with a `Props` type
alongside. Server Components by default; add `"use client"` only when the
component genuinely needs state, effects, or browser APIs — see
[nextjs](./nextjs.md).

```tsx
type Props = {
  label: string;
  onSelect: (id: string) => void;
};

export const OptionRow = ({ label, onSelect }: Props) => { /* ... */ };
```

## Props

- **No `className` or `style` props.** A component that accepts arbitrary
  styling from a parent has no boundary; the parent can break it from a
  distance. Expose named variants instead — see [styling](./styling.md).
- Do not spread unknown props onto a DOM node. Name what you accept.
- Prefer a discriminated union over a set of mutually exclusive booleans.
  `variant: "danger"` beats `isDanger` and `isPrimary` that can both be true.
- Pass data, not render instructions. A `children` slot beats a `renderFooter`
  prop beats a `footerConfig` object.

## Build on the component library

Use components from `@auteur/component-library` wherever one exists — buttons,
inputs, fields, dialogs, and the rest. Build app UI on those primitives instead
of raw HTML. If a primitive is missing, add it to the library and consume it.
Do not fork one locally.

## Hooks

- Never suppress the exhaustive-dependencies lint rule. A missing dependency is
  a stale-closure bug waiting for a render you did not predict. If the
  dependency causes a loop, the fix is a `useCallback`, a ref, or restructured
  state — not a suppression.
- Extract a custom hook when stateful logic is used twice, or when a component
  body has two unrelated concerns. Name it for the behavior, not the mechanism.
- Do not reach for `useEffect` to derive state. Compute it during render. An
  effect is for synchronizing with something *outside* React: a subscription, a
  timer, an imperative DOM API.
- Every effect that subscribes returns a cleanup.

## Data and errors

- Never `as`-cast a fetch response. Parse it — see
  [data-boundaries](./data-boundaries.md).
- Every route and every independently-failing region sits under an error
  boundary. A boundary renders a real recovery affordance — a retry, a way
  back — not a bare "something went wrong".
- A boundary catches render errors only. Errors in event handlers and async
  callbacks are handled where they happen, per [errors](./errors.md).

## Keys

Keys come from stable identity in the data. Never an array index, never a value
that changes between renders.

## Testing

Query by role and accessible name; assert what a user can perceive. See
[testing](./testing.md) and [accessibility](./accessibility.md).
