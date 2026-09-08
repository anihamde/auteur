---
id: icons
title: Icons
covers: Phosphor icons — per-icon SSR imports and the *Icon-suffixed names
tier: if-touched
trigger: "You import or add an icon."
---

# Icons

Phosphor is the icon set. Two rules, both easy to get wrong and neither caught
by the type checker.

## Import the SSR path, one icon per import

```ts
// correct
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { XIcon } from "@phosphor-icons/react/dist/ssr/X";

// wrong — barrel import: pulls in every icon and breaks Server Components
import { CaretRightIcon, XIcon } from "@phosphor-icons/react";
```

## Use the `*Icon`-suffixed name

```ts
// correct
import { XIcon } from "@phosphor-icons/react/dist/ssr/X";

// wrong — deprecated alias, slated for removal
import { X } from "@phosphor-icons/react/dist/ssr/X";
```

TypeScript will not flag the deprecated form.

## Usage

- Size and color icons with tokens, through the component's own props — never a
  hard-coded pixel size.
- A decorative icon next to a text label is `aria-hidden`. An icon that *is* the
  control carries an accessible name — see
  [accessibility](./accessibility.md).
