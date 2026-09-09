import { createHash } from "node:crypto";
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
/**
 * A short digest of the inputs.
 *
 * `node:crypto` rather than `Bun.hash`, because this runs in a serverless
 * function on Node as well as under Bun in tests and scripts. A Bun-only
 * global here is `Bun is not defined` on the first request of every
 * deployment, which is a failure with no local symptom at all.
 */
const hash = (parts: readonly string[]): string =>
  createHash("sha256").update(parts.join(" ")).digest("hex").slice(0, 8);

export const prosodyVersion = (): string =>
  `pros-${hash([
    segmenterVersion(),
    MATTR_WINDOW.toString(),
    ...LATINATE_SUFFIXES,
    ...GERMANIC_EXCEPTIONS,
  ])}`;
