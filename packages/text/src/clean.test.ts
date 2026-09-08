import { describe, expect, test } from "bun:test";
import { splitBlocks } from "./blocks.ts";
import { cleanGutenberg, GUTENBERG_MARKERS } from "./clean.ts";
import { cutWindows, safeBoundary } from "./cut.ts";
import { combineMarkers, detectDialogueMarker } from "./dialogue-marker.ts";
import { snapToSentence } from "./snap.ts";
import { countWords } from "./tokenize.ts";
import { cleanerVersion, segmenterVersion } from "./version.ts";

const gutenbergFile = (body: string): string =>
  [
    "The Project Gutenberg eBook of Something",
    "This ebook is for the use of anyone anywhere at no cost.",
    "",
    "*** START OF THE PROJECT GUTENBERG EBOOK SOMETHING ***",
    "",
    body,
    "",
    "*** END OF THE PROJECT GUTENBERG EBOOK SOMETHING ***",
    "",
    "Updated editions will replace the previous one—the old editions will be",
    "renamed. Creating the works from print editions not protected by U.S.",
  ].join("\n");

describe("a file with no marker is an error, not a text", () => {
  test("it throws corpus_unusable and names the source", () => {
    // The lenient alternative builds a card from a licence, silently, with
    // plausible-looking numbers. One loud error is the cheaper failure.
    expect(() =>
      cleanGutenberg("Just some text with no markers at all.", "https://x/1"),
    ).toThrow("no Project Gutenberg start marker");
  });

  test("the error carries the url rather than the file", () => {
    try {
      cleanGutenberg("nope", "https://gutenberg.org/files/1/1-0.txt");
    } catch (thrown) {
      expect(
        (thrown as { detail?: { sourceUrl?: string } }).detail?.sourceUrl,
      ).toBe("https://gutenberg.org/files/1/1-0.txt");
    }
  });
});

describe("cleaning removes everything that is not prose", () => {
  test("the licence header and trailer are gone", () => {
    const cleaned = cleanGutenberg(
      gutenbergFile("She left at dawn and did not look back."),
      "https://x/1",
    );
    expect(cleaned).toBe("She left at dawn and did not look back.");
    expect(cleaned).not.toContain("Project Gutenberg");
    expect(cleaned).not.toContain("Updated editions");
  });

  test("chapter headings are stripped, because they measure as tiny sentences", () => {
    // A heading left in registers as a very short sentence and a very short
    // paragraph, pulling both means down for any author whose works have
    // chapters — that is, all of them.
    const cleaned = cleanGutenberg(
      gutenbergFile(
        ["CHAPTER I", "", "She left at dawn.", "", "II", "", "He stayed."].join(
          "\n",
        ),
      ),
      "https://x/1",
    );
    expect(cleaned).not.toContain("CHAPTER");
    expect(cleaned).not.toMatch(/^II$/m);
    expect(cleaned).toContain("She left at dawn.");
    expect(cleaned).toContain("He stayed.");
  });

  test("illustrations and transcriber notes are stripped", () => {
    const cleaned = cleanGutenberg(
      gutenbergFile(
        ["[Illustration: a comet]", "", "She left at dawn."].join("\n"),
      ),
      "https://x/1",
    );
    expect(cleaned).not.toContain("Illustration");
  });

  test("a sentence that merely looks like a heading is kept", () => {
    // "Chapter" appearing in prose must not delete the paragraph around it.
    const cleaned = cleanGutenberg(
      gutenbergFile("Chapter after chapter, the library went on."),
      "https://x/1",
    );
    expect(cleaned).toContain("the library went on");
  });

  test.each(GUTENBERG_MARKERS.map(([start]) => [start] as const))(
    "the %s variant is recognised",
    (start) => {
      const raw = ["front matter", start, "", "Real prose here.", ""].join(
        "\n",
      );
      expect(cleanGutenberg(raw, "https://x/1")).toContain("Real prose here.");
    },
  );
});

describe("blocks carry their offsets", () => {
  test("each block's slice of the source is its own text", () => {
    // Offsets rather than just text, because exemplars cite a character range
    // and §6.9 addresses one. A list that lost its positions makes both a
    // search.
    const text = "First para.\n\nSecond para here.\n\nThird.";
    for (const block of splitBlocks(text)) {
      expect(text.slice(block.start, block.end)).toBe(block.text);
    }
  });

  test("word counts sum to the whole", () => {
    const text = "First para.\n\nSecond para here.\n\nThird.";
    const total = splitBlocks(text).reduce((sum, b) => sum + b.words, 0);
    expect(total).toBe(countWords(text));
  });
});

describe("the cut ladder", () => {
  const paragraph = `${"word ".repeat(120).trim()}.`;
  const text = Array.from({ length: 8 }, () => paragraph).join("\n\n");

  test("windows land within the requested word range", () => {
    for (const window of cutWindows(text, { max: 900, min: 400 })) {
      expect(window.words).toBeGreaterThanOrEqual(400);
      expect(window.words).toBeLessThanOrEqual(900);
    }
  });

  test("a window's slice of the source is its own text", () => {
    for (const window of cutWindows(text, { max: 900, min: 400 })) {
      expect(text.slice(window.start, window.end)).toBe(window.text);
    }
  });

  test("a single over-long block is cut at sentences, not dropped", () => {
    // Dropping it would bias the sample toward authors who paragraph often.
    // Sentences must start with an opener for the segmenter to split them; a
    // lowercase continuation after a full stop is not an ending, which is the
    // rule and not an accident. An earlier version of this fixture used
    // lowercase starts and produced one 1,600-word "sentence".
    const long = Array.from(
      { length: 40 },
      () => `Word ${"word ".repeat(39).trim()}.`,
    ).join(" ");
    const windows = cutWindows(long, { max: 300, min: 100 });
    expect(windows.length).toBeGreaterThan(1);
  });

  test("a boundary never tears a surrogate pair", () => {
    // The corpus is translations; a lone half makes every downstream regex
    // behave oddly around it.
    const withEmoji = `a${"\u{1F600}"}b`;
    for (let index = 0; index <= withEmoji.length; index += 1) {
      const at = safeBoundary(withEmoji, index);
      expect(withEmoji.slice(0, at)).not.toMatch(/[\uD800-\uDBFF]$/);
    }
  });
});

describe("the dialogue marker, without which the ratio is a silent zero", () => {
  test.each([
    ["double", '"Yes," he said. "No," she replied. "Truly," he added.'],
    [
      "guillemet",
      "«Oui», dit-il. «Non», répondit-elle. «Vraiment», ajouta-t-il.",
    ],
    [
      "em-dash",
      ["—Yes, he said.", "—No, she replied.", "—Truly, he added."].join("\n"),
    ],
    ["none", "She left at dawn and did not look back."],
  ] as const)("%s is detected", (expected, text) => {
    expect(detectDialogueMarker(text)).toBe(expected);
  });

  test("an em-dash text is never reported as none", () => {
    // This is the whole reason the detector exists: dialogue ratio measured
    // against quotation marks reports zero here, and a zero that looks like a
    // measurement is worse than no measurement.
    const emDash = ["—Yes, he said.", "—No, she replied."].join("\n");
    expect(detectDialogueMarker(emDash)).not.toBe("none");
  });

  test("a corpus mixing conventions reports mixed", () => {
    expect(combineMarkers(["double", "em-dash"])).toBe("mixed");
    expect(combineMarkers(["double", "double", "none"])).toBe("double");
    expect(combineMarkers(["none", "none"])).toBe("none");
  });
});

describe("snapToSentence widens outward", () => {
  const text = "She left at dawn. He never wrote again. The comet returned.";

  test("a span starting mid-sentence snaps to the sentence start", () => {
    const { from } = snapToSentence(text, 8, 30);
    expect(text.slice(from)).toStartWith("She left");
  });

  test("a span ending mid-sentence snaps to the sentence end", () => {
    const { to } = snapToSentence(text, 0, 25);
    expect(text.slice(0, to)).toEndWith("wrote again.");
  });

  test("an already-aligned span is unchanged", () => {
    const aligned = snapToSentence(text, 0, 17);
    expect(aligned).toEqual({ from: 0, to: 17 });
  });

  test("it never narrows", () => {
    for (let from = 0; from < text.length; from += 3) {
      for (let to = from; to <= text.length; to += 7) {
        const snapped = snapToSentence(text, from, to);
        expect(snapped.from).toBeLessThanOrEqual(from);
        expect(snapped.to).toBeGreaterThanOrEqual(to);
      }
    }
  });
});

describe("versions are derived from the data, not hand-edited", () => {
  test("both are stable across calls", () => {
    expect(segmenterVersion()).toBe(segmenterVersion());
    expect(cleanerVersion()).toBe(cleanerVersion());
  });

  test("they are distinct, because re-cleaning and re-measuring differ", () => {
    // Re-cleaning requires re-fetching; re-segmenting does not. One version for
    // both would force a network round trip for a change that needed none.
    expect(segmenterVersion()).not.toBe(cleanerVersion());
  });

  test("the segmenter version is a function of the abbreviation list", async () => {
    // The property that makes the bump automatic: a hand-written version string
    // is one someone forgets, and the consequence is a card and a draft
    // measured by different code with no sign that the numbers are not
    // comparable.
    const source = await Bun.file(
      new URL("./version.ts", import.meta.url),
    ).text();
    expect(source).toContain("ABBREVIATIONS");
    expect(source).not.toMatch(/return "seg-\d/);
  });
});
