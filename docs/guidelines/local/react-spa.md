---
id: react-spa
title: React — a Vite SPA, so no server components
covers: The one rule in the seeded React guideline that does not apply
tier: if-touched
trigger: "You author or modify a component, a hook, or any JSX."
overrides: [react]
---

# React — a Vite SPA, so no server components

The seeded `react` guideline opens with "Server Components by default, `use
client` only where interaction requires it". auteur's client is a Vite SPA:
every component is a client component, there is no server renderer, and `use
client` is not a directive anything reads.

**That rule is struck. Everything else in the seeded document stands** — hooks
at the top, no conditional hooks, derived state computed rather than stored,
effects only for synchronising with something outside React, keys that are
identities rather than indices.

The two consequences worth naming, because the seeded document assumes a server
renderer and therefore does not:

**Data fetching is explicit and lives at a route boundary.** There is no server
component to await in. A screen fetches through `@auteur/api-client`, and the
loading and error states are part of the screen rather than something a
framework arranges. The wizard's rule that a step never blocks (invariant 3)
makes this visible: every screen has a rendering for "not yet" that is a real
state and not a spinner.

**The stream is a subscription, not a render.** `@auteur/stream-client` owns the
EventSource and the cursor; components read what it has delivered. A component
that opened its own connection would open a second one on every re-render, and
the reconnect logic would be duplicated in whichever component happened to be
mounted.
