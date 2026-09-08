/**
 * `card@3 · full-text · confidence 0.86`.
 *
 * The separator is a middot with hairline spaces, matching the design's mono
 * meta rows. Empty parts are dropped rather than rendered as `· ·`, so a
 * caller can pass a value it may not have without branching at the call site —
 * which is the whole reason a card with no confidence yet does not produce a
 * row with a hole in it.
 */
export const metaRow = (parts: readonly (string | undefined)[]): string =>
  parts
    .filter((part): part is string => part !== undefined && part.trim() !== "")
    .join(" · ");
