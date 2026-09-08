import type { CardStrength, StyleCard } from "@auteur/core/style-card";

/**
 * Confidence, and the four facts beside it.
 *
 * **`confidence` is citation coverage and nothing else** (`ARCHITECTURE.md`
 * §4.5). It answers exactly one question — how much of this card is backed by
 * evidence — and it is the only question a single number can answer honestly.
 *
 * An earlier design blended corpus size, work count and concentration into one
 * weighted scalar. The weights were invented, and a two-decimal number produced
 * from invented weights claims a precision it does not have. So the other facts
 * are shown as themselves, and the reader who cares about corpus concentration
 * sees it rather than having it averaged into invisibility.
 */

/** Every claim on a card, flattened, with the dotted path that reaches it. */
type FlatClaim = {
  readonly path: string;
  readonly origin: string;
  readonly cited: boolean;
};

const CLAIM_GROUPS = [
  "dialogue",
  "diction",
  "imagery",
  "rhythm",
  "structure",
  "voice",
] as const;

const isClaim = (
  value: unknown,
): value is { origin: string; citation?: unknown } =>
  typeof value === "object" &&
  value !== null &&
  "origin" in value &&
  typeof (value as { origin: unknown }).origin === "string";

/**
 * Walk the card's claim-bearing fields.
 *
 * Driven by the group list rather than by a recursive walk of the whole object:
 * a recursive walk would find `author`, `toolchain` and `sources` and have to
 * exclude them by shape, and "looks like a claim" is a weaker test than "is in
 * a group that holds claims". `antiPatterns` sits at the top level and is
 * handled beside the groups for the same reason — it is a claim, and it is the
 * one that is not in a group.
 */
export const flattenClaims = (card: StyleCard): FlatClaim[] => {
  const found: FlatClaim[] = [];
  const record = (path: string, value: unknown): void => {
    if (!isClaim(value)) return;
    found.push({
      cited: value.citation !== undefined,
      origin: value.origin,
      path,
    });
  };

  record("antiPatterns", card.antiPatterns);
  for (const group of CLAIM_GROUPS) {
    for (const [field, value] of Object.entries(card[group])) {
      record(`${group}.${field}`, value);
    }
  }
  return found;
};

/**
 * Citation coverage.
 *
 * `cited / attempted`, where **attempted counts every derived field the
 * extraction returned, including the ones it could not cite**. Those are not on
 * the card — `claimSchema` refuses a derived claim with no citation — so
 * counting from the card alone would make every card 1.00 and measure nothing.
 *
 * **No branch on `provenance`.** A secondary card attempts no derived fields at
 * all, so the denominator is zero and this returns zero through the same
 * expression. A `provenance === "secondary"` check here would be a second place
 * for the two kinds of card to disagree, and the first place it would show is a
 * report.
 */
export const confidenceOf = (attempted: number, cited: number): number =>
  attempted === 0 ? 0 : cited / attempted;

export type StrengthInput = {
  readonly derivedFields: number;
  readonly citedDerivedFields: number;
  readonly measuredWords: number;
  readonly workCount: number;
  /** Words per work, in any order. */
  readonly wordsPerWork: readonly number[];
};

/**
 * The four facts, unblended.
 *
 * `largestWorkShare` is what a reader needs to see and what a blended score
 * would hide: a card built from twelve works where one is 61% of the words is a
 * card describing that one work, and the number says so.
 */
export const cardStrengthOf = (input: StrengthInput): CardStrength => {
  const total = input.wordsPerWork.reduce((sum, words) => sum + words, 0);
  return {
    citedDerivedFields: input.citedDerivedFields,
    derivedFields: input.derivedFields,
    largestWorkShare:
      total === 0 ? 0 : Math.max(0, ...input.wordsPerWork) / total,
    measuredWords: input.measuredWords,
    workCount: input.workCount,
  };
};
