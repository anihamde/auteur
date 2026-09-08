---
id: functions
title: Functions
covers: Arrow syntax, immutability, declarative iteration, and signatures
tier: always
---

# Functions

## Arrow function expressions

Declare functions as `const` arrow expressions. They are consistent with the
rest of the codebase's binding style and have no hoisting surprises.

```ts
export const formatBytes = (bytes: number): string => { /* ... */ };
```

Use a `function` declaration only where the language requires it — a generator,
or a hoisted helper referenced above its definition in a file that must read
top-to-bottom.

## Annotate the return type

Every exported function annotates its return type. Inference is convenient
until a refactor silently widens a return and the error surfaces three modules
away.

## Immutable by default

- Do not mutate parameters. Return a new value.
- Do not mutate a value you did not create. If a caller handed it to you, it is
  theirs.
- Prefer `readonly` arrays and properties for data that should not change.
- Build objects in one expression rather than assembling them field by field.

```ts
// wrong
const withDefaults = (options: Options): Options => {
  options.retries ??= 3;
  return options;
};

// right
const withDefaults = (options: Options): Options => ({ retries: 3, ...options });
```

## Declarative over imperative

Prefer `map`, `filter`, `flatMap`, `find`, `some`, and `every` to a hand-rolled
loop that pushes into an accumulator. They say what the result is rather than
how it was built.

Reach for a `for...of` loop when the body has real control flow — an early
return, an `await` that must be sequential, or accumulation across several
values at once. A loop is not a failure; a loop that reimplements `map` is.

Prefer a manual loop to a generator. Generators add laziness and a second
control-flow model for a result that is almost always consumed eagerly.

## Small, single-purpose

A function does one thing. When you find yourself writing a comment to mark
"now the second part," that part is a function.

Parameters: up to three positional. Beyond that, or when two share a type and
could be swapped at a call site, take a single options object.

```ts
// wrong — the call site reads `connect(url, 3, 5000, true)`
const connect = (url: string, retries: number, timeoutMs: number, tls: boolean) => {};

// right
const connect = (url: string, options: ConnectOptions) => {};
```

Boolean parameters are a smell: `render(true)` tells the reader nothing. Take a
named option or split the function.

## Pure where possible

Push I/O, clocks, and randomness to the edges; keep the logic in between pure.
Pure functions are the ones you can test without a harness — which is also why
collaborators are injected rather than imported. See [testing](./testing.md).
