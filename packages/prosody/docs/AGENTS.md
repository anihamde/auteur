---
package: packages/prosody
---

# AGENTS — `@auteur/prosody`

Addendum for this package. It does not relist root rules; assume the root
[`AGENTS.md`](../../../AGENTS.md) is already loaded. On conflict, this file
wins.

## Package rules

**This package carries a version string that is part of the style card's cache
key.** A change to any measure changes the numbers on every card built
afterwards, and a cached card built by the old code would be compared against a
draft measured by the new one. The version is derived by hashing everything that
decides a number — the suffix lists, the exception list, the window size —
rather than written by hand. Do not replace that with a literal.

**A measurement is never an opinion, and never a model call.** Nothing in this
package may reach a provider. Invariant 1 is this package's whole reason to
exist.

**Not having been able to measure is not zero.** `dialogueRatio` returns
`undefined` for a `mixed` or `none` marker rather than `0`, because a reader
cannot tell a measured zero from an unmeasurable one once they are the same
value.

**The latinate classifier is a declared proxy.** Every measure it produces
carries a `classifier` block saying so, and `latinateGate()` is *read* rather
than counted — the scored set asks the gate rather than counting to five, so
demoting the measure is one line. Do not inline the threshold at a call site.
