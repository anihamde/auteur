import { segmenterVersion } from "@auteur/text/version";
import { GERMANIC_EXCEPTIONS, LATINATE_SUFFIXES } from "./latinate-lists.ts";
import { MATTR_WINDOW } from "./mattr.ts";

/**
 * The prosody version, derived from everything that decides a number.
 *
 * Same reasoning as `@auteur/text`'s: a hand-written version is one somebody
 * forgets to bump, and the consequence is silent — a corpus measured by one
 * classifier compared against a draft measured by another, with nothing saying
 * the two numbers are not comparable.
 *
 * It includes the segmenter's version because every measure here is computed
 * over the segmenter's output: changing where sentences end changes mean
 * sentence length without changing a line of this package.
 */
const hash = (parts: readonly string[]): string =>
  Bun.hash(parts.join(" ")).toString(16).padStart(8, "0").slice(0, 8);

export const prosodyVersion = (): string =>
  `pros-${hash([
    segmenterVersion(),
    MATTR_WINDOW.toString(),
    ...LATINATE_SUFFIXES,
    ...GERMANIC_EXCEPTIONS,
  ])}`;
