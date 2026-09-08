---
id: language-choice
title: Language choice
covers: TypeScript first, Rust second, otherwise the strictest option available
tier: always
---

# Language choice

## The order

1. **TypeScript.** The default for everything: apps, services, libraries,
   scripts, build tooling, one-off utilities.
2. **Rust**, when TypeScript genuinely cannot do the job — native integration,
   hard real-time or memory constraints, CPU-bound work where the runtime is
   the bottleneck, or a platform with no TypeScript runtime.
3. **The most type-strict language available**, when neither fits — usually
   because a platform or vendor SDK forces the choice.

"Genuinely cannot" means you tried, or you can name the specific blocker.
Preference, familiarity, and "this feels more natural in X" are not blockers. A
benchmark showing the TypeScript version misses a stated requirement is.

## Justify a non-TypeScript choice in writing

Any package not in TypeScript needs, in its README:

- what forced the choice,
- what was tried or ruled out, and why,
- how it is built, tested, and released alongside the rest of the repo.

A polyglot repo is a cost paid by everyone who touches it. The doc is the
receipt.

## Whatever the language: strictness is not optional

Every language in the repo must have:

- **Strict type checking** at the strictest setting it supports, with no
  per-file escapes. TypeScript: `strict` plus `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. Rust: warnings denied in CI. Python (last
  resort): full annotations with a type checker in strict mode.
- **A linter and a formatter**, both run in CI, both failing the build.
- **The same test discipline** as everywhere else — see
  [testing](./testing.md). TDD is not a TypeScript-only rule.
- **One command** that runs its checks, wired into the repo's task runner, so a
  contributor never needs to know it is a different language to verify it.

If a language cannot meet all four, do not introduce it.

## Shell scripts

Shell is for invoking other programs, not for logic. The moment a script grows
a conditional over parsed output, an array, or arithmetic, rewrite it in
TypeScript. Scripts that survive get the same review and the same tests as
source.
