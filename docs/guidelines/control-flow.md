---
id: control-flow
title: Control flow
covers: undefined over null, explicit checks, braces, switch, minimal mutation
tier: always
---

# Control flow

Rules for values, branches, and bindings inside functions. See also
[functions](./functions.md).

## `undefined`, never `null`

Use `undefined` for optional values, missing data, and uninitialized state. The
only acceptable `null` is one an external API demands.

## Check for `undefined` explicitly

Use `=== undefined` / `!== undefined`, not truthiness. Truthiness silently
treats `0`, `""`, `false`, and `NaN` as missing.

```ts
// wrong
if (!count) {
  handleMissing();
}

// right
if (count === undefined) {
  handleMissing();
}
```

The same applies to `??` versus `||`: use `??`.

## Curly braces always

Every `if`, `else`, `for`, and `while` body gets braces, including single-line
bodies. No exceptions.

## `switch` over `if`/`else if` chains

Branching on the value of one expression is a `switch`. Chains of `else if`
hide non-exhaustiveness; a `switch` over a union lets the type checker prove
every case is handled.

```ts
switch (state.kind) {
  case ConnectionState.Idle: {
    return start();
  }
  case ConnectionState.Open: {
    return send(state.socket);
  }
  case ConnectionState.Closed: {
    return reopen();
  }
}
```

Brace every `case` body. Do not add a `default` that swallows unknown values —
without one, the type checker reports an unhandled case, which is what you
want. When a `default` is genuinely required, make it throw.

## Prefer ternaries to reassignment

A value chosen from two branches is a ternary, not a `let` written twice.

```ts
// wrong
let label;
if (isActive) {
  label = "Active";
} else {
  label = "Idle";
}

// right
const label = isActive ? "Active" : "Idle";
```

Nested ternaries beyond one level are unreadable; at that point extract a
function with a `switch`.

## No unnecessary `let`

Default to `const`. A `let` is a claim that the binding genuinely changes over
time — a loop accumulator you measured as necessary, or a value assigned inside
a `try`. Most `let`s are a ternary, a `.map`, or a `.reduce` waiting to happen.

## Make control flow explicit

- Return early to avoid nesting, but do not scatter returns through a long
  function — that is a signal to split it.
- Do not rely on fallthrough, implicit coercion, or the truthiness of a
  non-boolean.
- No `for...in`. Iterate `Object.entries`, `Object.keys`, or `Object.values`.
- No labeled breaks. Extract a function and return.

## No non-null assertions

`!` and `as` erase the checks that make the code safe. If a value may be
`undefined`, narrow it. If the type is wrong, fix the type. See
[types](./types.md).
