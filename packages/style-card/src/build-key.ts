import { createHash } from "node:crypto";
/**
 * The card's cache key.
 *
 * `ARCHITECTURE.md` §4.4: a hit is a `build_key` match, a miss inserts
 * `version = max(version) + 1`, and cards are never updated in place. So this
 * function decides what counts as "the same card", and everything it leaves out
 * is something the product is asserting cannot change a card.
 *
 * Seven components, and each is here because leaving it out would produce a
 * wrong hit:
 *
 * - **authorId** — obviously.
 * - **the work ids, sorted** — sorted, so the order `corpus-select` happened to
 *   return them in is not part of the identity. Two runs choosing the same
 *   twelve works are the same corpus.
 * - **the cleaner version** — cleaning decides what text was measured.
 * - **the segmenter version** — segmentation decides the sentence boundaries
 *   every prosody number is computed over.
 * - **the prosody version** — the measures themselves.
 * - **the extraction prompt version** — editing a prompt bumps every card it
 *   built. That is why prompts live in one pure package whose exports carry a
 *   version constant: a prompt edit is a reviewable diff with a visible
 *   consequence rather than a silent change in what the product believes about
 *   an author.
 * - **the extraction model id** — two models reading the same passages do not
 *   produce the same card, and a card that does not record which model wrote
 *   its qualitative half cannot be compared with another.
 *
 * The prompt version and the model id arrive as **strings**, not as an imported
 * prompt module or a resolved provider. This package is `service`-layer;
 * `prompt` and `provider-router` are `agent`-layer, and the dependency gate
 * refuses the upward edge. Calling the extraction stage is `pipeline`'s job.
 */

export type BuildKeyInput = {
  readonly authorId: string;
  readonly workIds: readonly string[];
  readonly cleanerVersion: string;
  readonly segmenterVersion: string;
  readonly prosodyVersion: string;
  readonly extractionPromptVersion: string;
  readonly extractionModelId: string;
};

/**
 * The components, in a fixed order, joined by a separator none of them can hold.
 *
 * A newline rather than a space: a work id or a version string containing a
 * space would otherwise let two different inputs produce the same joined
 * string, and a collision here is a card served for a corpus it was not built
 * from. Ids and versions do not contain newlines, and the separator being
 * impossible in the parts is what makes the join injective.
 */
export const buildKeyComponents = (input: BuildKeyInput): string[] => [
  input.authorId,
  [...input.workIds].sort((left, right) => left.localeCompare(right)).join(","),
  input.cleanerVersion,
  input.segmenterVersion,
  input.prosodyVersion,
  input.extractionPromptVersion,
  input.extractionModelId,
];

export const buildKey = (input: BuildKeyInput): string =>
  createHash("sha256")
    .update(buildKeyComponents(input).join("\n"))
    .digest("hex");
