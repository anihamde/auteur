/**
 * `24.6 w`, `6.4/1k`, `0.08`.
 *
 * The number of decimals a measurement is shown to **is a claim about its
 * precision**, and getting it right in one function beats getting it wrong in
 * twenty call sites. That is the whole reason this exists rather than each
 * surface calling `toFixed`.
 *
 * Counts get one decimal, ratios two — a sentence length of 28.44 words claims
 * a hundredth of a word, which the measurement does not have, while a dialogue
 * ratio of 0.1 hides the difference between 0.06 and 0.14.
 *
 * A trailing zero is kept, not stripped. `0.10` and `0.1` say different things
 * about precision, and the second is the one that lies.
 */
export type ProsodyUnit = "words" | "per1k" | "ratio";

/**
 * Round half away from zero, at a fixed number of decimals.
 *
 * `toFixed` does not do this and cannot be made to. It rounds the *binary
 * double*, which for a decimal like 6.35 is a hair below the value you wrote —
 * so `(6.35).toFixed(1)` is `"6.3"` while `(6.45).toFixed(1)` is `"6.5"`. Both
 * are defensible in isolation; what they are not is predictable, and a reader
 * comparing two punctuation rates cannot see why one went up and the other
 * down. In a product whose argument is that the numbers carry the argument,
 * that is worth eight lines.
 *
 * The epsilon nudge is scaled to the magnitude so it corrects the
 * representation error without moving a value that is genuinely below the
 * midpoint.
 */
const toFixedHalfUp = (value: number, decimals: number): string => {
  const scale = 10 ** decimals;
  const scaled = value * scale;
  const nudged = scaled + Math.sign(scaled) * Math.abs(scaled) * Number.EPSILON;
  const rounded = Math.sign(nudged) * Math.round(Math.abs(nudged));
  return (rounded / scale).toFixed(decimals);
};

export const prosodyValue = (value: number, unit: ProsodyUnit): string => {
  switch (unit) {
    case "words": {
      return `${toFixedHalfUp(value, 1)} w`;
    }
    case "per1k": {
      return `${toFixedHalfUp(value, 1)}/1k`;
    }
    case "ratio": {
      return toFixedHalfUp(value, 2);
    }
  }
};
