---
id: accessibility
title: Accessibility
covers: Semantic HTML, names, focus, and keyboard operation
tier: if-touched
trigger: "You author or modify any user-facing markup or interaction."
---

# Accessibility

Accessibility is not a pass at the end. It is the same work as building the
component, and it is what makes the component testable by role — see
[testing](./testing.md).

## Semantic elements first

Use the element that already has the behavior: `button`, `a`, `label`, `nav`,
`dialog`, `table`, `fieldset`. A `div` with a click handler has no keyboard
support, no focus behavior, and no role.

ARIA is a patch for the gap the platform leaves, not a substitute. A correct
element beats a `div` with three ARIA attributes.

## Every control has an accessible name

- A form control is associated with a `label`; placeholder text is not a label.
- An icon-only button carries `aria-label` — see [icons](./icons.md).
- An image carries `alt`. A decorative image carries `alt=""`.
- A name that reads well aloud beats one that reads well on screen.

## Keyboard

Everything usable with a mouse is usable with a keyboard, in a sensible order.

- Never remove a focus outline without a visible replacement.
- Focus order follows the visual order; no positive `tabIndex`.
- A dialog traps focus while open, returns it to the trigger on close, and
  closes on `Escape`.
- Do not attach behavior to hover alone.

## State is announced

Loading, error, and empty states are conveyed to assistive technology, not only
by color or position. Use `aria-live` for content that updates in place,
`aria-invalid` plus an associated message for a failed field, and `aria-current`
for the active item in a set.

Color is never the only signal. Pair it with text, an icon, or a shape.

## Motion and contrast

- Respect `prefers-reduced-motion`; disable non-essential animation under it.
- Text meets WCAG AA contrast against its background in both themes. Semantic
  tokens handle this if you use them — see [styling](./styling.md).
