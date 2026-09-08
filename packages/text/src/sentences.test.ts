import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { ABBREVIATIONS, isAbbreviation } from "./abbreviations.ts";
import { splitSentences } from "./sentences.ts";
import { countWords } from "./tokenize.ts";

describe("the three exceptions, each of which silently shortens the corpus", () => {
  test.each([
    ["a title", "Mr. Smith went home. He did not return.", 2],
    ["a Latin abbreviation", "The birds, i.e. the crows, left. Then dusk.", 2],
    ["a decimal", "The value is 3.14 exactly. Nothing more.", 2],
    ["initials", "J. L. Borges wrote it.", 1],
    ["an ellipsis trailing off", "She paused… and then went on.", 1],
    ["an ellipsis that does end", "She paused… Then she left.", 2],
    ["ASCII ellipsis trailing off", "She paused... and went on.", 1],
  ])("%s: %j splits into %i", (_label, text, expected) => {
    expect(splitSentences(text)).toHaveLength(expected);
  });

  test("getting these wrong shortens the mean, it does not fail", () => {
    // The reason each exception is tested by name: a segmenter without them
    // reports a corpus of very short sentences, which looks like an author who
    // writes tersely rather than like a bug.
    const text = "Mr. J. L. Borges, b. 1899, wrote it. It was short.";
    const naive = text.split(/[.!?]+\s+/).length;
    expect(splitSentences(text)).toHaveLength(2);
    expect(naive).toBeGreaterThan(2);
  });
});

describe("ordinary endings", () => {
  test.each([
    ['"Yes," he said. "No," she replied.', 2],
    ["Is it true? I think so! Perhaps.", 3],
    ["One sentence with no terminator", 1],
    ["", 0],
    ["   ", 0],
  ])("%j splits into %i", (text, expected) => {
    expect(splitSentences(text)).toHaveLength(expected);
  });

  test("a closing quote after the terminator stays with its sentence", () => {
    const [first] = splitSentences('"It returns." She looked up.');
    expect(first).toBe('"It returns."');
  });
});

describe("the abbreviation list is data, and complete enough to matter", () => {
  test("single letters are initials", () => {
    expect(isAbbreviation("J")).toBe(true);
    expect(isAbbreviation("the")).toBe(false);
  });

  test("matching is case-insensitive", () => {
    expect(isAbbreviation("Mr")).toBe(true);
    expect(isAbbreviation("MR")).toBe(true);
  });

  test("the list has no duplicates", () => {
    expect(new Set(ABBREVIATIONS).size).toBe(ABBREVIATIONS.length);
  });

  test("every entry is lowercase, since matching lowercases first", () => {
    for (const entry of ABBREVIATIONS) {
      expect(entry).toBe(entry.toLowerCase());
    }
  });
});

describe("properties", () => {
  /**
   * Sentences whose last word is not an abbreviation.
   *
   * The generator has to know about the list, because a sentence ending in
   * `al.` or `no.` legitimately does *not* split — that is the abbreviation
   * exception working. fast-check found this on its own with the
   * counterexample `["Aaa al."]`, which is the property test doing its job on
   * the test rather than on the code.
   */
  const plainSentence = fc
    .stringMatching(/^[A-Z][a-z]{2,8}(?: [a-z]{2,8}){0,6}[.!?]$/)
    .filter((sentence) => {
      const lastWord = /([a-z]+)[.!?]$/.exec(sentence)?.[1] ?? "";
      return !isAbbreviation(lastWord);
    });

  test("sentence word counts sum to the whole", () => {
    // The invariant that makes mean sentence length meaningful: no token is
    // dropped at a boundary and none is counted twice.
    fc.assert(
      fc.property(
        fc.array(plainSentence, { maxLength: 30, minLength: 1 }),
        (sentences) => {
          const text = sentences.join(" ");
          const total = splitSentences(text).reduce(
            (sum, sentence) => sum + countWords(sentence),
            0,
          );
          return total === countWords(text);
        },
      ),
      { numRuns: 500 },
    );
  });

  test("splitting is stable under repetition", () => {
    fc.assert(
      fc.property(plainSentence, (sentence) => {
        const text = `${sentence} ${sentence} ${sentence}`;
        return splitSentences(text).length === 3;
      }),
      { numRuns: 300 },
    );
  });
});
