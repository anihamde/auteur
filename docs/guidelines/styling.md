---
id: styling
title: Styling
covers: Panda CSS is the only styling system; tokens, recipes, and the shared preset
tier: if-touched
trigger: "You write or modify any UI styling."
---

# Styling

## Mandates

- **Panda CSS is the only styling system.** No Tailwind, no CSS modules, no
  StyleX, no scoped `.css` files, no inline `style` objects, no CSS-in-JS
  runtime. Styles live in the `.tsx` next to the component that uses them.
- **Every UI package extends the `@auteur/component-library` Panda preset.** It
  owns the design tokens — semantic colors, spacing, typography, radii,
  durations, easings, shadows, z-indices, keyframes — and the shared recipes.
  No package defines competing tokens.
- **Use `@auteur/component-library` components where they exist.** Build on the
  primitives instead of restyling raw HTML. Missing a primitive means adding it
  to the library, not forking one.

## Setting up a package

1. Add `@pandacss/dev` and `postcss` to `devDependencies`, and
   `@auteur/component-library` as a `workspace:*` dependency.
2. Create `panda.config.ts` extending the shared preset; do not redefine theme
   values there.
3. Add the generated `styled-system` directory to `.gitignore` and to the
   package's `outputs` in `turbo.json`.

## The static extractor is the first thing to suspect

Panda extracts styles at build time by reading **literal values** inside calls
to its helpers (`css`, `cva`, patterns). A value it cannot resolve statically
produces a class name with **no CSS rule attached** — the element gets the
class and the property silently does not apply. Nothing errors.

The extractor cannot trace into:

- **A helper's return value passed to a Panda function.**
  `cva({ base: sharedBase })` where `sharedBase` is imported from another
  module. Same for `flex(myHelper())` and `compoundVariants: build()`.
  Publish shared styles as a `css(...)` class name and compose with `cx(...)`,
  or inline the literal at the call site.
- **Anything constructed at runtime.** `SIZES.map((size) => ({ css: { padding:
  TABLE[size] } }))` is opaque. Write the entries out.
- **Cross-file constant lookups in a consumer `cva`.** `paddingInline:
  SPACING[size]` resolves inside the preset's own `defineRecipe`, because the
  preset is fully loaded at build time, but not in a consumer `cva`. Inline the
  literal, with a comment pointing at the source table.

It handles reliably:

- Object literals passed directly: `css({ color: "fg.default" })`.
- Ternaries with literal branches: `paddingBlock: compact ? 2 : 4`.
- Pattern `.raw()` composition anywhere in a `cva` object — `base`, `variants`,
  or `compoundVariants`.

When a property mysteriously stops applying, inspect the element. If the
expected class is present but no matching rule exists in the bundle, it is an
extraction failure, not a specificity problem.

## Tokens, never raw values

Every color, space, radius, duration, and font size comes from a token. A raw
value in a style object is a defect: it will not respond to the theme and it
drifts from everything around it.

```tsx
// wrong
<div className={css({ color: "#1a1a1a", padding: "12px" })} />

// right
<div className={css({ color: "fg.default", padding: "3" })} />
```

If a value you need is not a token, add it to the preset. "Just this once" is
how a design system dies.

## Semantic tokens, not literal ones

Reference tokens by role — `fg.muted`, `bg.surface`, `border.subtle` — not by
appearance. `gray.700` bakes in a light-theme assumption; the semantic token
resolves correctly in both themes.

## Recipes for variants

A component with variants uses a recipe, not conditional class strings. The
recipe declares the variant axes and their combinations in one place, so the
type system enumerates what is valid.

## Responsive and state styles

Use Panda's conditions — `md:`, `_hover`, `_focusVisible`, `_disabled`,
`_dark` — rather than media queries written by hand or state tracked in
JavaScript. Style state in CSS wherever CSS can express it.

Always style `_focusVisible`. Never remove a focus ring without replacing it
with a visible alternative — see [accessibility](./accessibility.md).

## Layout

Prefer flex and grid utilities and the spacing scale over margins on children.
A component does not set its own outer margin; the parent that places it owns
the spacing.
