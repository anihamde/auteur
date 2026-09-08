---
id: icons-lucide
title: Icons — Lucide, through a closed wrapper
covers: The icon set, and the wrapper every icon goes through
tier: if-touched
trigger: "You import or add an icon."
overrides: [icons]
---

# Icons — Lucide, through a closed wrapper

The seeded `icons` guideline is written for Phosphor. auteur's design system is
Lucide (`docs/design/design-system`), so the two rules that are about Phosphor's
package shape do not transfer: there is no `/ssr` import path and no `*Icon`
name suffix.

What the seeded document is *for* transfers exactly, and stands:

- **One icon per import.** An icon set is hundreds of modules; importing the
  barrel pulls all of them into the bundle.
- **Size and colour come from tokens, through the component's own props.** Never
  a hard-coded `24` and never a hex value. An icon that does not change with the
  theme is an icon that disappears in one of them.
- **A decorative icon is `aria-hidden`.** An icon beside a label the reader can
  already see is noise to a screen reader; an icon that *is* the label needs an
  accessible name, not a hidden one.

## The wrapper is closed, which is stricter than the seed

Icons are not imported at their use site. `@auteur/icons` exports one `Icon`
component over a **closed set** of names, and a name outside the set does not
type-check.

The reason is the design system's, not a preference: the icon vocabulary is part
of the visual language, and an interface where any of a thousand glyphs may
appear has no vocabulary. It also makes the bundle's icon cost a property of one
file rather than of every import in the repository.

Adding an icon is an edit to that set, which is a reviewable diff. That is the
point.
