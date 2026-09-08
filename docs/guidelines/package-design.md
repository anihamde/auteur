---
id: package-design
title: Package design
covers: Many small packages, each with an obvious and defensible purpose
tier: always
---

# Package design

## Prefer many small packages over few large ones

A package is the unit of purpose, dependency, and testability. Splitting is
cheap; untangling a package that grew three unrelated responsibilities is not.

Every package must pass all three:

1. **Clear** — you can state what it does in one sentence, with no "and".
2. **Defensible** — you can say what does *not* belong in it, and why.
3. **Obvious** — a contributor looking for a behavior can guess which package
   holds it from the name alone.

If a package fails any of them, split it.

## Signals a package should be split

- Its README's first paragraph needs "and" or a bulleted list of unrelated
  responsibilities.
- Two consumers depend on it but use disjoint halves of its exports.
- A change to one part routinely forces a version bump that other consumers do
  not care about.
- Its dependency list contains something most of its code never touches — a UI
  framework in a package that is mostly pure logic, a database driver in a
  package that mostly formats strings.
- Its name contains `utils`, `common`, `shared`, `helpers`, `core`, or `misc`.
  These names permit anything, so eventually they contain everything. Name a
  package for what it *is*.

## What a package owns

- **One responsibility**, expressed through a small public API.
- **Its own tests**, runnable in isolation without the rest of the repo running.
- **Its own README** — see [documentation](./documentation.md).
- **An explicit dependency list.** A package that reaches into another
  package's internals, or into an app, is a layering violation. Fix the export
  or move the code.

## Dependency direction

Dependencies point one way: apps depend on packages; packages depend on
packages lower in the graph; nothing depends on an app. No cycles, ever — a
cycle between two packages means they are one package, or a third package is
missing.

When two packages need the same type, the type belongs in a package below both,
not duplicated and not re-exported sideways.

## Splitting is not free either

A package per file is not the goal. The test is the three properties above, not
a size limit. Two modules that always change together and are never consumed
separately are one package.
