# @auteur/biome-config

The lint and format configuration every package extends. Hand-written: it is
one of the two packages `bun run new:package` does not generate, because the
generator's own output is checked by rules that live here.

## `useLiteralKeys` is off, and it has to be

`tsconfig` sets `noPropertyAccessFromIndexSignature`, which requires
`row["column"]` for every read through an index signature. This rule wants
`row.column` for the same expression. Two enabled checks demanding opposite
spellings of one line produced 118 diagnostics nobody could act on — one per
column read in the stores.

The type-level one wins: it is what catches a misspelled column name at compile
time, where the lint rule is a style preference.
