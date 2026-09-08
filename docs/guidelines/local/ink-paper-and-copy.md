---
id: ink-paper-and-copy
title: Ink and paper, and the words
covers: The two-ground colour system, tokens-only styling, and where user-facing strings live
tier: if-touched
trigger: "You write UI styling, or any string a user reads."
---

# Ink and paper, and the words

The seeded `styling` guideline is taken unmodified and this sits beside it. What
follows is auteur's own, and no seeded document covers any of it.

## Two grounds, and which one a thing belongs on

The design system has two: **ink** — the application chrome, the rails, the
panels, the controls — and **paper**, a cream ground used for exactly one thing:
**an artifact the product produced**. The outline, the streaming draft, the
finished story.

It is a claim, not a decoration. Paper says *this is the work*; ink says *this
is the machinery around it*. A panel on paper, or a story on ink, is that claim
made wrongly, and the draft screen shows both at once deliberately — the prose
on paper, the live drift measurements on ink beside it — because that is the
distinction the whole interface rests on.

Paper carries its own hairline (`--border-paper`, black at 14%) and its own
muted ink. The ink tokens do not read correctly on it, and the two sets are not
interchangeable.

## Tokens only

No hex values, no `px`, no `rgba()` anywhere in a component. Every colour,
space, radius, duration and type size comes from a token. The theme has three
states — auto, light, dark — and a literal is a value that is right in one of
them.

This is gate 7, so it is enforced rather than reviewed.

## Status is a rule along the top edge, never a coloured left border

A finding card carries a 3px status rule on its **top** edge: laurel for pass,
amber for drift. The left border is the rail's affordance for "this is where you
are", and using it for status makes two different things look the same.

## There are no faded states

Disabled is `--text-muted` on `--surface-sunken`, at full opacity. Hover is a
surface change. `opacity: 0.5` is not in the system, and a test asserts its
absence: a faded control is one a reader with low contrast sensitivity cannot
find, and it reads as broken rather than as unavailable.

The one exception the design specifies is the disabled `secondary`-corpus author
row, and it is exactly one row.

## Every user-facing string lives in `@auteur/copy`

Not for translation — there is one locale. Because the content rules below are
tests over the barrel, and a rule that applies only to the strings someone
remembered to put in the barrel is not a rule. A screen that inlines its own
sentence is invisible to the lint.

The rules, each of which has a case in `packages/copy/src/rules.test.ts`:

- Sentence case everywhere, including buttons and table headers. The wordmark is
  lowercase `auteur` in every position.
- Address the reader as *you*. The app never says "we", "I" or "Let's" — a
  product that speaks as a person is claiming a relationship it does not have,
  and this one's whole argument is that it is showing you evidence.
- Name the machinery honestly and in mono: `style-extract`,
  `voice.narratorDistance`, `sequential-scene`, `balanced`. Never "Analyzing…".
  An ellipsis is what an interface writes when it has nothing to report; this
  one reports stage ids and streamed detail lines.
- Let the numbers carry the argument. Never "good match".
- Every question states why it was asked. Every skip says it is never blocked.
- No emoji. No exclamation marks.
