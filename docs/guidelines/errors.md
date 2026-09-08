---
id: errors
title: Errors & failure handling
covers: Code offensively — no defensive guards, no swallowed failures
tier: always
---

# Errors & failure handling

The governing principle is **code offensively**: assume nothing, fail loudly.
Loud failures are debuggable; silent ones rot the system.

## Hard rules

**Defensive guards and silent failure are not allowed. This is a PR blocker.**

- **Throw on unexpected conditions.** If the invariants say it can't happen,
  throw. An unreachable branch is a bug; treat it like one.
- **No catch-and-swallow.** If you `catch`, you must do one of:
  1. Re-throw, optionally wrapped with context.
  2. Convert to a `Result` the caller is forced to handle (see
     [option-result](./option-result.md)).
  3. Log **and** take a real recovery action — one that restores the system to
     a valid state distinct from the error: retry, roll back a partial write,
     fall back to a cached value the caller explicitly opted into.

  "Log and return `undefined`" is not recovery. It is catch-and-swallow with a
  log line on top. Empty `catch` blocks and `catch` arms returning a fallback
  to hide the failure are forbidden.
- **No defensive checks for impossible conditions.** Don't write
  `if (x === undefined) return;` on a value the type system already guarantees.
  If the type allows the bad case, fix the type — don't paper over it at every
  call site.
- **No silent fallbacks.** Returning `undefined`, `null`, `[]`, `0`, or a
  "sensible default" in place of an error is silent failure. Throw, or return a
  `Result` the caller must unwrap.

```ts
// wrong — the failure disappears and the caller sees an empty list
const loadUsers = async (): Promise<User[]> => {
  try {
    return await fetchUsers();
  } catch (error) {
    console.error(error);
    return [];
  }
};

// right — the failure is the caller's to handle
const loadUsers = async (): Promise<User[]> => {
  try {
    return await fetchUsers();
  } catch (error) {
    throw new Error("Failed to load users", { cause: error });
  }
};
```

## Error messages carry context

An error message must let a reader locate the failure without a debugger. Name
the operation and the inputs that identify it. Attach the underlying failure as
`cause` rather than string-concatenating it.

```ts
throw new Error(`No migration found for schema version ${String(version)}.`);
```

## Never `void` a promise

Every promise is awaited, returned, or explicitly handled. A floating promise
turns a rejection into an unhandled rejection detached from its call site.

```ts
// wrong
void flush();

// right — the caller decides
await flush();
```

For fire-and-forget work that genuinely must not block, attach an explicit
handler that does something real; do not discard the rejection.

## Validate at the boundary, trust inside

Do not sprinkle validation through internal call chains. Parse and validate
once where untrusted data enters the system (see
[data-boundaries](./data-boundaries.md)), then let the types carry the
guarantee inward. Every internal re-check is a defensive guard.
