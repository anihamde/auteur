import { describe, expect, test } from "bun:test";
import type { BuildKeyInput } from "./build-key.ts";
import { buildKey, buildKeyComponents } from "./build-key.ts";

const base: BuildKeyInput = {
  authorId: "gutenberg:borges-jorge-luis-1899",
  cleanerVersion: "clean-a1",
  extractionModelId: "claude-haiku-4-5",
  extractionPromptVersion: "style-extract@1",
  prosodyVersion: "pros-b2",
  segmenterVersion: "seg-c3",
  workIds: ["gutenberg:2", "gutenberg:1"],
};

const CHANGES: readonly [string, Partial<BuildKeyInput>][] = [
  ["the author", { authorId: "gutenberg:chekhov-1860" }],
  ["the works", { workIds: ["gutenberg:1", "gutenberg:3"] }],
  ["the cleaner", { cleanerVersion: "clean-a2" }],
  ["the segmenter", { segmenterVersion: "seg-c4" }],
  ["the prosody version", { prosodyVersion: "pros-b3" }],
  ["the extraction prompt", { extractionPromptVersion: "style-extract@2" }],
  ["the extraction model", { extractionModelId: "gpt-5" }],
];

describe("identical inputs produce an identical key", () => {
  test("the same input twice", () => {
    expect(buildKey(base)).toBe(buildKey(base));
  });

  test("the work order does not matter", () => {
    // Sorted, so the order corpus-select happened to return them in is not
    // part of the identity. Two runs choosing the same twelve works are the
    // same corpus, and a rebuild is a cache hit rather than a version 4.
    expect(buildKey({ ...base, workIds: ["gutenberg:1", "gutenberg:2"] })).toBe(
      buildKey(base),
    );
  });
});

describe("changing any one of the seven components changes the key", () => {
  test.each(CHANGES)("%s", (_name, change) => {
    expect(buildKey({ ...base, ...change })).not.toBe(buildKey(base));
  });

  test("all seven are in the key, and nothing else is", () => {
    // A component nobody could change is a component that is not in the key,
    // and one nobody can name is a component whose absence is undetectable.
    expect(buildKeyComponents(base)).toHaveLength(7);
    expect(CHANGES).toHaveLength(7);
  });
});

describe("the join is injective", () => {
  test("a separator none of the parts can hold", () => {
    // With a space, a work id containing a space would let two different
    // inputs produce the same joined string — and a collision here serves a
    // card for a corpus it was not built from.
    for (const part of buildKeyComponents(base)) {
      expect(part).not.toContain("\n");
    }
  });

  test("moving a character across a boundary changes the key", () => {
    expect(
      buildKey({ ...base, authorId: "a", cleanerVersion: "b-clean-a1" }),
    ).not.toBe(
      buildKey({ ...base, authorId: "a-b", cleanerVersion: "clean-a1" }),
    );
  });
});
