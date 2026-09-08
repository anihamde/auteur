---
id: files
title: Files & directories
covers: Reading order within a file, naming, and where code lives
tier: always
---

# Files & directories

## Files read top-to-bottom

Entry points at the top; helpers *after* the call sites that use them. A reader
starts at line 1, meets the exported declaration within the first screen or
two, and finds every helper by scrolling down — never up.

Typical order:

1. **Imports** — third-party first, then local, alphabetical within each group
   (the formatter handles this).
2. **Re-exports** the module merely forwards.
3. **Module-level constants** the entry point references — lookup tables, fixed
   configuration.
4. **Type declarations** for the exported surface.
5. **The exported entry point(s).**
6. **Helpers**, in the order the code above first reaches them.

## Import from the defining module

Import a symbol from the module that defines it, not from a barrel or an
intermediate that happens to re-export it. Barrels obscure the dependency graph,
defeat tree-shaking, and turn an unrelated edit into a rebuild of everything.

Within a package, prefer deep imports (`./parse-config.ts`) over an index.

## No grab-bag files

`utils.ts`, `helpers.ts`, `common.ts`, `misc.ts` and `types.ts` are forbidden as
destinations. They accept anything, so they accumulate everything, and nothing
in them is discoverable.

Name a file for what it holds: `parse-duration.ts`, `retry-policy.ts`,
`connection-state.ts`. A type lives in the module that owns the behavior it
describes; if two modules share it, it moves to the module below both.

## One concept per file

A file holds one exported concept plus what it needs privately. When a second
unrelated export appears, split. Test files sit next to the module they cover
(`parse-duration.test.ts` beside `parse-duration.ts`).

## Prefer module-scoped functions to methods on ad-hoc classes

A function that takes its inputs as arguments is easier to test, tree-shake,
and move. Reach for a class only when you need identity, lifecycle, or a
resource that must be disposed.

## Directory shape follows the domain

Group directories by feature or domain, not by technical kind. Prefer
`billing/invoice-total.ts` over `services/`, `models/`, `helpers/`. Technical
groupings scatter each change across every directory.
