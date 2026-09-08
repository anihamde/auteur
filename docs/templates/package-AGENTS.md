---
package: packages/ui
promotes:
  always: [react, styling, accessibility]
---

# AGENTS — `packages/ui`

Addendum for this package. It does not relist root rules; assume the root
[`AGENTS.md`](../../../AGENTS.md) is already loaded. On conflict, this file
wins.

## Promoted guidelines

The `promotes.always` list above raises those guidelines to **ALWAYS** for
work in this package. They are `IF TOUCHED` at the root, which is right for
the repository and wrong here: this package is UI, so every change in it
touches them.

Read each one in full before any change under this directory, exactly as you
would a root ALWAYS doc.

Promotion is the only direction. A guideline that does not apply to this
package needs no entry — its trigger simply never fires here.

## Package rules

Rules specific to this package, which the root guidelines do not cover and
should not. Examples of what belongs here:

- A boundary this package must not cross, and why.
- A convention its consumers depend on.
- A workaround for how one of its dependencies behaves.

Each rule states what to do and the defect it prevents. Delete this section if
the package has no such rules — a promotion list alone is a legitimate
addendum.

## What does not belong here

- Restating a root guideline.
- A rule that would hold for any package in the repo. That belongs in
  `docs/guidelines/local/`.
- Loosening a root rule. An addendum augments; it never weakens.
