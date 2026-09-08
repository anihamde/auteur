---
id: monorepo
title: Monorepo layout
covers: Workspace structure, the dependency catalog, and cross-package rules
tier: if-touched
trigger: "You add a package, change a package.json, or move code between packages."
---

# Monorepo layout

## Layout

Bun workspaces, in two top-level directories:

- `/apps` — deployable units. An app is a thin composition layer: routing,
  configuration, wiring. Logic lives in packages.
- `/packages` — libraries, published or internal.

Each workspace is named `@auteur/<name>` and holds its own
`package.json`, `tsconfig.json`, tests, and `README.md`.

The bias is toward more, smaller packages — see
[package-design](./package-design.md). New behavior starts in a package, not in
an app, unless it is genuinely app-specific wiring.

## `catalog:` for every third-party dependency

Every non-workspace dependency uses `"catalog:"` as its version. Every
workspace dependency uses `"workspace:*"`. Concrete versions live only in the
root `package.json`'s `catalog` block, which is the single source of truth.

```jsonc
"dependencies": {
  "zod": "catalog:",
  "@auteur/schema": "workspace:*"
}
```

To add a third-party dependency:

1. Add it to the root `catalog` block, alphabetically sorted.
2. Reference it as `"catalog:"` in the consuming package.
3. Run `bun install` to refresh the lockfile.

A concrete version written directly in a package is a defect. If you find one
already in the repo, fix it.

Do not add a new runtime dependency without confirming the intent — see
[security](./security.md).

## Cross-package rules

- Import from a package's public entry point, never from its `src/` internals.
  If you need something that is not exported, export it deliberately or move it.
- Dependencies point one way: apps depend on packages, packages depend on
  packages below them. No cycles.
- A type shared by two packages moves to a package below both. Do not duplicate
  it, and do not re-export it sideways.
- A package's tests run without any app running.

## Adding a package

1. Create `packages/<name>/` with `package.json`, `tsconfig.json`, `src/`, and
   `README.md`.
2. Give it the standard task names so Turbo picks it up — see
   [tooling](./tooling.md).
3. Write the README first: if you cannot state the package's purpose in one
   sentence with no "and", the split is wrong.
4. Write a failing test before the first line of implementation — see
   [testing](./testing.md).
