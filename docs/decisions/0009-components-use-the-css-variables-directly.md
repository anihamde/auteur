# 0009 — Components use the CSS custom properties directly, not Panda's runtime

**Status:** accepted · **Date:** 2026-09-08 · **Work package:** WP-Q1

## Context

`ARCHITECTURE.md` §8.1 and the implementation plan's WP-Q1 call for PandaCSS:
`@auteur/tokens` as a preset, `component-library` with a `panda.config.ts`
extending it, and components styled with Panda's `css()`.

The preset exists and is tested (gate 7). What does not fit is the second half.
Panda's `css()` is not a runtime function — it is a marker that a build-time
extractor finds, and it only resolves through `styled-system/`, a directory
Panda's `codegen` writes. Using it means:

- a `panda codegen` step per package that styles anything, producing a
  generated directory that gate 6 has no account of and that every checkout
  must run before `tsc` will pass;
- the extractor running over `packages/component-library` *and* over
  `apps/auteur-web`, because a style written in a package and used in an app is
  only emitted if the app's extractor sees it;
- component tests that render into happy-dom seeing **no styles at all**, since
  the emitted CSS is a build artifact the test never loads — which is precisely
  the case where the axe contrast rule stops meaning anything.

The third is the one that decides it. The reason gate 7 and the axe audit exist
is that a token resolving to nothing must be caught. Under Panda's extraction
model, a unit test cannot catch it.

## Decision

Components carry their styles as ordinary `style` objects whose values are
`var(--token)` references — the same custom properties `@auteur/tokens` maps and
`docs/design/design-system/tokens/*.css` declares.

`@auteur/tokens/preset` stays. It is the mapping from the design CSS into
Panda's shape, it is what gate 7 tests, and it is what a future migration to
Panda's extractor would build on. Nothing is thrown away; one consumer is
deferred.

The property WP-Q1's adherence lint was for — *no hardcoded hex, px, duration
or easing where a token exists* — is enforced as a test over the component
sources instead of as an oxlint rule. A test can say which file and which
literal, and it runs in the same command as everything else.

## What was rejected

**Panda codegen per package.** Three costs above, and the third is not
recoverable: the components' own tests would render unstyled, so the contrast
rule that catches an unresolved token would have nothing to look at.

**A CSS-in-JS runtime.** A second styling system beside the design CSS, and one
whose output the design system's own stylesheet could not be diffed against.

**Inline literal values, as the prototype's JSX has them.** That is what the
adherence test refuses. The prototype is a mockup; a hardcoded `#1a1a1a` does
not follow the theme.

## Consequences

- `component-library` has no `panda.config.ts` and no generated directory.
- `styles.ts` holds the token references components share, so a token used in
  four components is named once.
- `adherence.test.ts` fails on a hex colour, a bare `px` length, a duration in
  `ms` or a `cubic-bezier` in any component source, naming the file and the
  literal.
- Component tests render with the real custom properties in scope, so an axe
  contrast failure means what it says.
