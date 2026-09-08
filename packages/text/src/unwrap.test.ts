import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { countWords } from "./tokenize.ts";
import { unwrap } from "./unwrap.ts";

/** Roughly how a Gutenberg plain-text file arrives: hard-wrapped at ~70. */
const wrapAt = (text: string, columns: number): string => {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length + word.length + 1 > columns) {
      lines.push(line);
      line = word;
    } else {
      line = line === "" ? word : `${line} ${word}`;
    }
  }
  if (line !== "") {
    lines.push(line);
  }
  return lines.join("\n");
};

const PARAGRAPH = [
  "The universe which others call the Library is composed of an indefinite",
  "and perhaps infinite number of hexagonal galleries with vast air shafts",
  "between surrounded by very low railings from any of the hexagons one can",
  "see interminably the upper and lower floors without end and the",
  "arrangement of the galleries is invariable twenty shelves five long",
  "shelves per side cover all the sides except two",
].join(" ");

describe("the ten-word paragraph, which is the bug this prevents", () => {
  const wrapped = wrapAt(PARAGRAPH, 70);

  test("before unwrapping, a line-as-paragraph reads near ten words", () => {
    // This is the number a naive implementation reports for every author who
    // ever lived. It is asserted here so the fix cannot be removed without the
    // symptom coming back visibly.
    const lines = wrapped.split("\n");
    const mean =
      lines.reduce((sum, line) => sum + countWords(line), 0) / lines.length;
    expect(mean).toBeLessThan(15);
  });

  test("after unwrapping, the block is one paragraph of its real length", () => {
    const paragraphs = unwrap(wrapped).split("\n\n");
    expect(paragraphs).toHaveLength(1);
    expect(countWords(paragraphs[0] ?? "")).toBe(countWords(PARAGRAPH));
    expect(countWords(paragraphs[0] ?? "")).toBeGreaterThan(50);
  });
});

describe("breaks that are real are kept", () => {
  test("blank lines still separate paragraphs", () => {
    const text = `${wrapAt(PARAGRAPH, 70)}\n\n${wrapAt(PARAGRAPH, 70)}`;
    expect(unwrap(text).split("\n\n")).toHaveLength(2);
  });

  test("verse keeps its line breaks", () => {
    // Joining a poem would turn it into one very long sentence and move every
    // sentence-length measure for an author who wrote any.
    const verse = [
      "Tyger Tyger, burning bright,",
      "In the forests of the night;",
      "What immortal hand or eye,",
      "Could frame thy fearful symmetry?",
    ].join("\n");
    expect(unwrap(verse)).toBe(verse);
  });

  test("a terminator followed by an indented line is the author's break", () => {
    const text = "She left at dawn.\n    He never wrote again.";
    expect(unwrap(text)).toBe("She left at dawn.\nHe never wrote again.");
  });

  test("a continuation at the margin is the wrapper's break, and is joined", () => {
    const text = "She left at dawn and did not\nlook back.";
    expect(unwrap(text)).toBe("She left at dawn and did not look back.");
  });

  test("CRLF is normalised", () => {
    expect(unwrap("one two\r\nthree four")).toBe("one two three four");
  });
});

describe("properties", () => {
  test("unwrapping preserves the word count exactly", () => {
    // A joiner that drops or duplicates a token would corrupt every rate
    // downstream while still looking like it worked.
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z]{1,10}$/), {
          maxLength: 120,
          minLength: 1,
        }),
        fc.integer({ max: 80, min: 20 }),
        (words, columns) => {
          const text = wrapAt(words.join(" "), columns);
          return countWords(unwrap(text)) === countWords(text);
        },
      ),
      { numRuns: 500 },
    );
  });

  test("unwrapping is idempotent", () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z]{1,10}$/), {
          maxLength: 60,
          minLength: 1,
        }),
        (words) => {
          const once = unwrap(wrapAt(words.join(" "), 40));
          return unwrap(once) === once;
        },
      ),
      { numRuns: 300 },
    );
  });
});
