# AGENTS

Context index for this repository. Every entry below carries an **authority
level** so its weight is unambiguous.

These guidelines were seeded from
[`agent-guidelines`](https://github.com/ac-zeitgeist/agent-guidelines) using the **Local app** profile.
They are a starting point, not a ceiling: this repository's own rules, added
under `docs/guidelines/local/`, take precedence over anything seeded. See
[Precedence](#precedence) below.

## Authority levels

- **ALWAYS** — load and read in full before any work. No exceptions for size,
  urgency, familiarity, or "trivial" edits. Skipping an ALWAYS doc is a
  protocol violation, not a judgment call.
- **IF TOUCHED** — required when your change touches the topic. The decision
  is "does my change touch the topic," not "do I feel like reading this." If
  touched, load in full.
- **REFERENCE** — look up as needed during the work; not a prerequisite to
  start.

If a doc's own wording disagrees with these labels, the labels here win —
update the doc.

## Precedence

More specific beats more general. When two documents conflict:

1. `{package}/docs/AGENTS.md` — rules for one package.
2. `docs/guidelines/local/*.md` — rules for this repository.
3. `docs/guidelines/*.md` — seeded defaults.

A local doc that overturns a seeded rule MUST name it in front matter:

```yaml
---
id: sql-style
title: SQL style
covers: Query formatting and naming for this schema
tier: if-touched
trigger: You write or modify a SQL query.
overrides: [database]
---
```

Nothing is deleted to override it — the seeded doc stays, and the local doc
states what it replaces and why. That keeps the diff against the reference
readable when the seed is refreshed.

Prefer adding a local doc over editing a seeded one. Edits in place are legal
but show up as drift in `.agent-guidelines.lock` on the next refresh.

## Post-edit audit (non-negotiable)

After finishing edits — and before declaring a change done or opening a
PR — re-load the guideline docs that apply to what you just changed and walk
the actual diff against each rule. This is a protocol step, not a judgment
call. "Lint and tests passed" is not a substitute: many rules are not
lint-enforced.

**This audit runs on EVERY change, not just the first.** Addressing review
feedback, fixing CI, a follow-up tweak, a one-line amendment — each requires
you to redo the "which docs apply" determination from scratch. A follow-up
edit may touch a topic the original change did not, pulling a new **IF
TOUCHED** doc into scope.

In scope for the audit:

- Every **ALWAYS** doc.
- Every **IF TOUCHED** doc whose trigger your diff actually satisfies. Be
  honest about "touched": if you added an `if`, you touched control flow; if
  you added a parameter for testability, you touched testing; if you wrote a
  component, you touched React and styling.
- Every doc under `docs/guidelines/local/` that applies by the same rules.
- Any per-package addenda (`{package}/docs/AGENTS.md`) for packages you
  modified.

Memory is not a substitute for re-reading.

## PR description requirement

Every PR description MUST include a "Guidelines audited" line listing the docs
reviewed and confirming compliance:

> **Guidelines audited:** `docs/guidelines/testing.md`,
> `docs/guidelines/errors.md`, `docs/guidelines/local/sql-style.md`. Change
> complies with all rules.

Call out any intentional deviation below that line. A PR without it is
incomplete.

## ALWAYS — load in full before any work

| Doc | Covers |
|---|---|
| [Control flow](docs/guidelines/control-flow.md) | undefined over null, explicit checks, braces, switch, minimal mutation |
| [Documentation](docs/guidelines/documentation.md) | Package READMEs, design docs, and keeping prose current with code |
| [Errors & failure handling](docs/guidelines/errors.md) | Code offensively — no defensive guards, no swallowed failures |
| [Files & directories](docs/guidelines/files.md) | Reading order within a file, naming, and where code lives |
| [Functions](docs/guidelines/functions.md) | Arrow syntax, immutability, declarative iteration, and signatures |
| [Git & pull requests](docs/guidelines/git-and-prs.md) | Branching, commits, PR contents, and minimizing conflict surface |
| [Language choice](docs/guidelines/language-choice.md) | TypeScript first, Rust second, otherwise the strictest option available |
| [Package design](docs/guidelines/package-design.md) | Many small packages, each with an obvious and defensible purpose |
| [Testing](docs/guidelines/testing.md) | TDD is mandatory; parsimonious coverage; injection over mocking |
| [TypeScript tooling](docs/guidelines/tooling.md) | Bun, Turborepo, and Biome — the standard toolchain and its commands |
| [Types](docs/guidelines/types.md) | Strict compiler settings, no `any`, no `as`, and types that exclude bad states |

## IF TOUCHED — load when your change touches the topic

| Doc | Load when |
|---|---|
| [Accessibility](docs/guidelines/accessibility.md) | You author or modify any user-facing markup or interaction. |
| [Data boundaries](docs/guidelines/data-boundaries.md) | You read external data — an API response, a message, JSON.parse, storage, URL params, env vars — or you declare a schema that is sent to another system, such as a tool definition given to a model. |
| [Database](docs/guidelines/database.md) | You read from or write to the database, or change a query. |
| [Deployment](docs/guidelines/deployment.md) | You change deployment configuration, add a background job, or add a service. |
| [Discriminated unions](docs/guidelines/discriminated-unions.md) | You define or modify a discriminated union. |
| [HTTP APIs](docs/guidelines/http-api.md) | You add or modify an HTTP endpoint, or a webhook receiver. |
| [Icons](docs/guidelines/icons.md) | You import or add an icon. |
| [Migrations](docs/guidelines/migrations.md) | You change the database schema, or add a migration. |
| [Monorepo layout](docs/guidelines/monorepo.md) | You add a package, change a package.json, or move code between packages. |
| [React](docs/guidelines/react.md) | You author or modify a component, a hook, or any JSX. |
| [Security](docs/guidelines/security.md) | You handle secrets, user input, authentication, authorization, or outbound requests. |
| [Styling](docs/guidelines/styling.md) | You write or modify any UI styling. |

## REFERENCE — look up as needed

| Doc | Covers |
|---|---|
| [CI](docs/guidelines/ci.md) | Keeping CI fast and correct, and what to do when it fails |
| [Result & Option types](docs/guidelines/option-result.md) | When a fallible API returns a Result instead of throwing |


## Repository-specific guidelines

Docs under [`docs/guidelines/local/`](docs/guidelines/local/) are authored in
this repository and are not part of the seed. They use the same front matter
and the same authority levels, and they win over seeded docs per
[Precedence](#precedence).

Add one when a rule is real for this codebase and would not generalize to
every project — a schema convention, a domain invariant, a workaround for a
dependency's behavior. Do not add one to restate a seeded rule.

| Doc | Tier | Overrides | Load when |
|---|---|---|---|
| [The four invariants](docs/guidelines/local/invariants.md) | **ALWAYS** | — | Always. It also promotes `data-boundaries` to ALWAYS repository-wide. |
| [Icons — Lucide](docs/guidelines/local/icons-lucide.md) | IF TOUCHED | `icons` | You import or add an icon. |
| [HTTP — Hono](docs/guidelines/local/http-hono.md) | IF TOUCHED | `http-api` | You add or modify an HTTP endpoint. |
| [React — a Vite SPA](docs/guidelines/local/react-spa.md) | IF TOUCHED | `react` | You author or modify a component, a hook, or any JSX. |
| [Ink and paper, and the words](docs/guidelines/local/ink-paper-and-copy.md) | IF TOUCHED | — | You write UI styling, or any string a user reads. |

## Per-package addenda

When working on a package in `/apps/` or `/packages/`, check for
`{package}/docs/AGENTS.md` and load it if present. Addenda do not relist root
rules, and on conflict they win.

An addendum does two things:

**Promotes guidelines for that package.** A guideline that is `IF TOUCHED` at
the root can be unconditional inside one package — styling rules in a UI
package, database rules in the data-access package. The addendum says so:

```yaml
---
package: packages/ui
promotes:
  always: [react, styling, accessibility]
---
```

Read those in full before any change under that directory, exactly as you would
a root ALWAYS doc. Promotion is the only direction: a guideline that does not
apply to a package needs no entry, because its trigger never fires there.

**Holds rules specific to that package** — a boundary it must not cross, a
convention its consumers depend on, a workaround for a dependency's behavior. A
rule that would hold for any package in the repo belongs in
`docs/guidelines/local/` instead.

An addendum never weakens a root rule. It augments.

Start from [`docs/templates/package-AGENTS.md`](docs/templates/package-AGENTS.md).

DO NOT proceed with any changes until the applicable files are loaded and
understood.
