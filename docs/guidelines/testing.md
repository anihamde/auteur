---
id: testing
title: Testing
covers: TDD is mandatory; parsimonious coverage; injection over mocking
tier: always
---

# Testing

## STOP — TDD is mandatory for every change

Code without tests does not ship. **Do not write any production code until a
failing test exists.** This is a hard rule, not a preference you weigh against
other concerns.

**The cycle, in order. No step may be skipped or merged:**

1. Write a failing test for the behavior you want.
2. Run it; confirm it fails *for the right reason* — asserting on the absent
   behavior, not on a typo or a compile error.
3. Write the **minimum** production code to make that test pass. No extra
   branches, fields, parameters, helpers, or "while I'm here" cleanup.
4. Run it; confirm it passes.
5. Refactor only while the test is green.
6. Repeat for the next slice of behavior.

**Applies to:** every change. New modules, new functions, new branches in
existing code, bug fixes, behavior-changing refactors, small fixes, "one-line"
fixes, "obvious" fixes, urgent fixes. Familiarity and size are not exemptions.

**Bug fixes specifically:** reproduce the bug as a failing test *first*. Watch
it fail. Then fix. A PR that fixes a bug with no regression test is incomplete.

**Forbidden:**

- Writing production code first and adding tests after.
- Writing the test and the code in one edit, then calling it TDD.
- Skipping the run-and-watch-it-fail step.
- Adding code no test exercises — speculative branches, unused parameters,
  defensive handling for cases no test triggers (see [errors](./errors.md)).
- Claiming a change is "too small" or "too obvious" to test.
- Loosening an assertion to make a test pass instead of fixing the code.

**The only exception** is code where a test would be prohibitively difficult to
write *and* would have very low value — trivial glue over a third-party surface
with no logic of its own. Both halves must hold, and you MUST justify both in
the PR description. "It was faster" is not a justification. If you reach for
this more than rarely, the production code needs restructuring for testability;
that restructure is part of the task.

**If you cannot figure out how to test a change, stop and ask.** Do not proceed
by writing untested code.

## Parsimonious coverage

Coverage must be high, and every test must earn its place. There is no
numeric threshold to hit; the target is *every failure mode covered*, not
*every line touched*.

A test belongs in the suite only if both hold:

- It is nontrivial — you can name the specific defect it catches.
- It covers something no existing test covers: a distinct behavior, boundary,
  branch, or failure mode.

Before adding a test, check whether an existing test already covers the
behavior. If it does, extend that test or refactor the suite; do not add
another.

Do **not** write tests that:

- Assert constants or literals.
- Re-test language or framework behavior.
- Restate an existing test with different inputs from the same equivalence
  class.
- Exist to move a coverage number.

A large suite of redundant tests is harder to maintain and does not increase
confidence. When a reviewer confirms a defect, extend the surface if the defect
is a *class* that could recur — a boundary, a branch, a contract between
components. A one-off mistake in a fixed value does not need a permanent test.

## Unit tests over integration tests

Prefer unit tests. Reach for integration tests only when a behavior cannot be
exercised through unit tests alone — typically because it spans processes, real
I/O, or infrastructure you cannot inject at the unit boundary.

With clean API boundaries, unit tests suffice for most logic. When they don't,
that usually means the boundaries aren't clean: the code under test does too
much, or its dependencies aren't injectable. Fix the seam; don't paper over it
with a heavier test.

Keep necessary integration tests in a dedicated folder (`src/__integration__/`
or `tests/integration/`). Don't mix them into the unit tree.

## Dependency injection over mocking

When a unit depends on an external collaborator — a clock, a network client, a
filesystem, a random source — accept it as a parameter and pass a test double
from the test. Do not reach into a module registry to swap an import.

Injected code is easier to follow (the dependency is visible in the signature),
the double can be a plain object, and the same seam serves production
substitution later.

Module mocking (`mock.module`, `jest.mock`, monkey-patched globals) couples the
test to the import graph, hides which collaborator was substituted, and leaks
state between tests. Reach for it only when injection is genuinely impossible —
usually a platform global you don't own. Mocking your own code is a signal the
code should take the collaborator as a parameter.

### Injection parameters default to the real implementation

Every parameter that exists *for testability* must default to the real thing.
Consumers call with no arguments; tests pass an override.

```ts
import { connectWebSocket as defaultConnect } from "./websocket-client.ts";

export const openConnection = (
  url: string,
  connect: typeof defaultConnect = defaultConnect,
): Promise<Connection> => connect(url);
```

Type the parameter as `typeof <defaultImpl>` so the stub's surface stays locked
to the real one. The injection point is a testing seam, not a public
configuration knob. Forcing every consumer to pass it leaks a testing concern
into the API.

## Test callbacks by promisifying, not mocking

When the assertion is "this callback fires, with these arguments," promisify it
and `await` inside an `async` test.

```ts
it("invokes the listener with the payload", async () => {
  const payload = await new Promise((resolve) => {
    subscribe(resolve);
  });

  expect(payload).toEqual({ kind: "ready" });
});
```

The promise asserts "it fired" implicitly — the test times out otherwise — and
yields real arguments instead of `mock.calls[0][0]`. Use a mock function only
for what the promise pattern cannot express: call counts, ordering across
several callbacks.

## Selectors

Prefer semantic selectors over structural ones:
`screen.getByRole("button", { name: "Save" })`, not
`container.querySelector("button.save")`. Tests that rely on implementation
details break for unrelated reasons.

## Never widen exports for tests

A module's exports are its public API. Never add an export solely because a test
needs it. If a test needs internals, split those internals into their own module
and test it through its real public API. Every export stays justified by a real
caller.

## Warnings are failures

Any warning the suite surfaces is a failure. Treat it like a non-zero exit code:
a PR with new warnings is not ready, and a PR landing on existing warnings must
clear them. This covers lint warnings (including unused or misplaced ignore
comments), React's "not wrapped in act(...)", stray `console.error`, and
deprecation notices.

Fix the cause. Do not suppress the warning or add a filter. If the cause is
genuinely inside a dependency you cannot reach, escalate rather than silence it.

## Running the suite

`bun run turbo test` runs the full suite: tests, typecheck, lint, and format
checks. It must pass before you open a PR and after every subsequent push.
