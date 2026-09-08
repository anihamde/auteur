# 0008 — The icon set is ten glyphs, and two of them are not in §2's list

**Status:** accepted · **Date:** 2026-09-08 · **Work package:** WP-P3

## Context

`ARCHITECTURE.md` §2 says the icon set is ten glyphs and does not enumerate
them. `docs/design/wizard-handoff` uses eight:

`check`, `chevron-down`, `arrow-right`, `arrow-left`, `git-branch`, `clock`,
`sun`, `moon`

The implementation plan's WP-P3 asks for the set to be settled against the
prototype and the delta recorded.

## Decision

The set is those eight plus **`search`** and **`x`**.

- **`search`** — the author screen is a search-as-you-type field
  (`ARCHITECTURE.md` §5.3). The prototype draws its magnifier as an inline
  glyph rather than through the `Icon` component, which is why a grep for icon
  names does not find it. It is an icon either way, and leaving it out of the
  set would mean the one screen that needs it either inlines an SVG — which the
  `icons-lucide` guideline forbids — or ships without the affordance the design
  shows.
- **`x`** — the model overlay (§6.3) is dismissible, and a dismissible overlay
  needs a close control. The prototype's overlay closes on the backdrop, which
  is not reachable from a keyboard on its own.

Ten, which is what §2 says. The count was right and the enumeration was
incomplete, which is the usual shape of this kind of gap.

## What was rejected

**Leaving the set at eight and inlining the two.** An inline SVG is not
theme-aware, not size-locked, and not counted — which is the whole reason the
wrapper is closed.

**Opening the set.** The vocabulary is part of the visual language; an interface
where any of a thousand glyphs may appear has no vocabulary. Adding a glyph
stays a reviewable diff against `names.ts`.

## Consequences

- `ICON_NAMES` has ten entries and a test asserts the count against the list, so
  a glyph added without a decision fails.
- `lucide-react` joins the catalog. The prototype draws each glyph as a CSS
  mask over a `unpkg.com` URL, which is right for a static mockup and wrong for
  the product: it makes every icon a network request, and one the
  content-security policy would have to allow. The glyphs are bundled instead.
