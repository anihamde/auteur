---
id: documentation
title: Documentation
covers: Package READMEs, design docs, and keeping prose current with code
tier: always
---

# Documentation

## Every package has a README

Each package and app carries a `README.md` that orients a new contributor:

- What it does, in one sentence.
- Why it exists — the responsibility it owns and what does not belong in it.
- Its dependencies, and what it is depended on by.
- How to use it: the public API, with a short real example.
- How to test it.

Comprehensive but succinct. Enough to be productive without reading the source.

## Documentation is part of the change, not a follow-up

When you change code, update the prose that describes it **in the same commit**:
READMEs, docstrings, comments, and any design doc that states the old behavior.
Documentation left stale next to changed behavior is a defect, not debt.

The reverse is also a rule: do not open a prose-only change during review — a
commit touching wording, summaries, or docstrings with no corresponding code
change. Rewording for clarity is not review work.

## Docstrings

Every exported symbol gets a docstring saying what it does and what the caller
must know — preconditions, failure modes, ownership of returned resources. Skip
the ones that restate the signature.

```ts
/** Parses an ISO-8601 duration into milliseconds. Throws on a malformed input. */
export const parseDuration = (input: string): number => { /* ... */ };
```

Comments inside a function explain *why*, never *what*. If a reader needs a
comment to follow what the code does, rename something or split it.

## Design docs

Write one before building anything whose shape is not obvious: a new subsystem,
a protocol between deploy units, a data model, a migration strategy. Keep them
in `docs/architecture/`.

Design docs are **not** guidelines. They carry no authority level and impose no
rules; they describe how a part of the system is or will be built. Read the
relevant one when working in its area — it is context, not compliance.

How to write one:

- **Lead with the answer.** The decision goes in the first paragraph, not after
  a tour of the alternatives.
- **Show, don't describe.** A type signature, a schema, or a sequence of calls
  beats a paragraph about them.
- **Decisions, not musings.** Record what was chosen and the one or two reasons
  that decided it. An option you rejected earns a line only if a reader would
  otherwise re-propose it.
- **Cut the ceremony.** No RFC boilerplate, no "Background" section restating
  what the reader already knows, no summary that repeats the body.
- **State open questions as open**, with who or what would resolve them.

Mark a doc as proposed or as built. A proposal that shipped and was never
updated is worse than no doc.

## Do not state facts from memory

Do not cite counts, file contents, section numbers, or API shapes without
reading them first. Read or grep, or leave the claim out.
