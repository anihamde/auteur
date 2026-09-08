---
package: packages/text
---

# AGENTS — `@auteur/text`

Addendum for this package. It does not relist root rules; assume the root
[`AGENTS.md`](../../../AGENTS.md) is already loaded. On conflict, this file
wins.

## Package rules

**This package carries a version string that is part of the style card's cache
key.** `cleanerVersion` and the segmenter version are inputs to `buildKey`
(`ARCHITECTURE.md` §4.4) and to `works`' uniqueness key. A change to what this
package *computes* must bump the version it exports, or every cached card
silently keeps numbers produced by the old code.

The versions are derived by hashing the data they depend on rather than being
written by hand, so the bump is automatic and a forgotten bump is not a defect
that can occur. Do not replace that with a literal.

**Re-cleaning requires re-fetching; re-segmenting does not.** That asymmetry is
why `works` is keyed on `(source_url, cleaner_version)` and not on the segmenter
too. Keep it: making the segmenter part of the key turns a free change into a
corpus re-download.

**Nothing here knows about a model.** Segmentation, cleaning and the cut ladder
are deterministic, and invariant 1 depends on their staying that way.
