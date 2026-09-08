---
id: option-result
title: Result & Option types
covers: When a fallible API returns a Result instead of throwing
tier: reference
---

# Result & Option types

`Result<T, E>` and `Option<T>` make failure and absence visible in the type
system instead of hiding them in thrown values and sentinel `undefined`s. This
is the companion to [errors](./errors.md); read both when designing a fallible
API.

Adopting a `Result` library is optional per repository. Adopt it deliberately —
one library, used consistently — or not at all. A codebase where half the
fallible functions throw and half return `Result`, with no rule for which, is
worse than either.

## When to return `Result<T, E>`

Return `Result` when failure is part of the contract — something the caller is
expected to handle, not an unrecoverable bug:

- **Operations crossing a process or network boundary**, where a thrown error
  cannot propagate cleanly.
- **Parsers and deserializers** that fail on bad input.
- **Expected, recoverable outcomes** the caller must decide about.

Keep throwing for programmer error and broken invariants. A `Result` for "this
can't happen" just makes every caller unwrap a case that never occurs.

## When to return `Option<T>`

Return `Option<T>` when absence is a normal outcome and the caller must
acknowledge it — a lookup that may miss, a first match that may not exist. When
`undefined` already reads unambiguously and the caller cannot forget to check
because the type forces it, plain `T | undefined` is fine; do not wrap for
ceremony.

## Rules

- **A function returns `Result` or throws, never both.** Document which.
- **Do not unwrap without handling.** Unwrapping unconditionally converts a
  handled failure back into a thrown one and defeats the point.
- **Type the error.** `Result<T, Error>` says nothing. Use a discriminated
  union of the failures the caller can actually distinguish — see
  [discriminated-unions](./discriminated-unions.md).
- **Convert at the boundary.** A library that throws is wrapped once, at the
  edge of your code, into a `Result`. Do not scatter `try`/`catch` inward.
