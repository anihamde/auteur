import { tokenizeLower } from "@auteur/text/tokenize";

/** The window MATTR is computed over. Part of the measure's definition. */
export const MATTR_WINDOW = 1000;
const STRIDE = 100;

export type MattrResult = {
  readonly value: number;
  /**
   * True when the text is shorter than one window, so the value is a
   * whole-length TTR and is **not comparable** to a corpus figure.
   */
  readonly insufficientLength: boolean;
};

/**
 * Moving-average type-token ratio over a fixed 1,000-word window.
 *
 * `PRD.md` §5 asked for raw type-token ratio, and `docs/ARCHITECTURE.md` §4.3
 * replaced it, for a reason that is not a preference: **raw TTR falls as text
 * length rises.** That is Heaps' law — a property of counting, not of the
 * author. A 900,000-word corpus and a 1,000-word story have mechanically
 * incomparable TTRs, so scoring one against the other, which `PRD.md` §10 makes
 * an automatic success criterion, would report every short story as more
 * lexically various than every author who ever wrote a novel.
 *
 * A fixed window removes the length dependence: every window is 1,000 words, so
 * the average over windows is comparable between any two texts long enough to
 * have one.
 *
 * A text shorter than a window reports its whole-length ratio and flags
 * `insufficientLength`, and the report marks the measure rather than comparing
 * it. Flash length is about 1,000 words, so this is the common case rather than
 * an edge one.
 */
export const mattr = (text: string): MattrResult => {
  const tokens = tokenizeLower(text);
  if (tokens.length === 0) {
    return { insufficientLength: true, value: 0 };
  }
  if (tokens.length < MATTR_WINDOW) {
    return {
      insufficientLength: true,
      value: new Set(tokens).size / tokens.length,
    };
  }

  const ratios: number[] = [];
  for (let start = 0; start + MATTR_WINDOW <= tokens.length; start += STRIDE) {
    const window = tokens.slice(start, start + MATTR_WINDOW);
    ratios.push(new Set(window).size / MATTR_WINDOW);
  }
  return {
    insufficientLength: false,
    value: ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length,
  };
};

/**
 * Raw type-token ratio.
 *
 * Exported **only** so the tests can demonstrate the length dependence MATTR
 * exists to remove. Nothing in the product scores against it.
 */
export const rawTypeTokenRatio = (text: string): number => {
  const tokens = tokenizeLower(text);
  return tokens.length === 0 ? 0 : new Set(tokens).size / tokens.length;
};
