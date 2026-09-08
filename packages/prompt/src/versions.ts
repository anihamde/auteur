/**
 * Every prompt's version, in one place.
 *
 * The pipeline needs a stage's prompt version to build an input key (§7.5) and
 * a card's `buildKey` (§4.4), and reading it from here rather than importing
 * eight modules is what keeps `style-card` from depending on `prompt` — a
 * service package reaching up into the agent layer, which the dependency gate
 * refuses.
 *
 * **A version is bumped when the prompt's text changes, and that is not a
 * bookkeeping chore.** `extractionPromptVersion` is in the card's cache key, so
 * bumping `style-extract` invalidates every card that prompt built. A prompt
 * edit is therefore a reviewable diff with a visible consequence, rather than a
 * silent change in what the product believes about an author.
 *
 * The harness asserts that this map and the modules agree, so a bumped module
 * with an unbumped entry here fails rather than quietly serving stale cards.
 *
 * There is no barrel beside this file, deliberately. Gate 4 refuses a star
 * re-export — it adds every name of its target to the subpath's public surface
 * while the snapshot reports it unchanged — and a barrel would make importing
 * one prompt pull in all eight, which a stage function's cold start pays for.
 * This map is the one thing a caller wants for every stage at once.
 */
export const PROMPT_VERSIONS = {
  clarify: "clarify@1",
  "corpus-select": "corpus-select@1",
  critique: "critique@1",
  draft: "draft@1",
  outline: "outline@1",
  revise: "revise@1",
  "style-extract": "style-extract@1",
  "summarize-beat": "summarize-beat@1",
} as const;

export type PromptId = keyof typeof PROMPT_VERSIONS;
export type PromptVersion = (typeof PROMPT_VERSIONS)[PromptId];

/** The shape every prompt module exports. */
export type Prompt<Input> = {
  readonly id: PromptId;
  readonly version: PromptVersion;
  /** Pure: no clock, no env, no I/O. That is what makes a snapshot mean something. */
  readonly build: (input: Input) => string;
};

export const versionOf = (id: PromptId): PromptVersion => PROMPT_VERSIONS[id];
