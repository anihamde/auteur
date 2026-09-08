---
id: discriminated-unions
title: Discriminated unions
covers: Enum discriminants, constructor objects, and wire-format serializers
tier: if-touched
trigger: "You define or modify a discriminated union."
---

# Discriminated unions

The shape a union takes in memory, and how it crosses a wire.

## The pattern

An enum for the discriminant, a constructor object with one factory per
variant, and the type derived from that object.

```ts
export enum ConnectionKind {
  Idle = "Idle",
  Open = "Open",
  Failed = "Failed",
}

export const Connection = {
  Idle: () => ({ kind: ConnectionKind.Idle }) as const,
  Open: (socket: WebSocket) => ({ kind: ConnectionKind.Open, socket }) as const,
  Failed: (error: Error) => ({ kind: ConnectionKind.Failed, error }) as const,
};

export type Connection = ReturnType<(typeof Connection)[keyof typeof Connection]>;
```

Why each part:

- **An enum discriminant**, not a bare string literal. Call sites reference
  `ConnectionKind.Open`, so a rename is a compiler error rather than a silent
  mismatch, and no variant name is ever spelled by hand at a `case`.
- **A constructor object** so a variant is built one way everywhere. Adding a
  field is one edit, not a search for object literals.
- **A derived type**, so the type and the constructors cannot drift apart.

Name the discriminant `kind`. Consistency lets a reader recognize a union
instantly.

## Narrowing

Branch with `switch` over the discriminant and no `default` — the checker then
reports any variant you forgot. See [control-flow](./control-flow.md).

## The wire format is separate

The in-memory format always uses the enum. A wire format — JSON on a network,
a database column, a URL param — uses whatever string the protocol specifies.
Do not conflate them.

Map between the two explicitly, in one place, at the boundary: a schema codec
that parses the wire string into the enum on the way in, and serializes it on
the way out.

```ts
const connectionKindSchema = z.enum(["idle", "open", "failed"]).transform(
  (wire) => wireToKind[wire],
);
```

Consequences worth stating:

- Renaming an enum member never changes the wire format, and changing the wire
  format never silently changes in-memory code. Each is a deliberate edit.
- The serializer is where a version bump gets handled when a contract crosses a
  deploy boundary. See [data-boundaries](./data-boundaries.md).
- Never `JSON.stringify` an in-memory union straight onto a wire.
