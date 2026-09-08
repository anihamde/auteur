import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { commonBigrams } from "./bigrams.ts";
import { dialogueRatio } from "./dialogue.ts";
import { isLatinate, latinateRatio, scoreClassifier } from "./latinate.ts";
import { latinateGate, PRECISION_THRESHOLD } from "./latinate-gate.ts";
import { GERMANIC_EXCEPTIONS } from "./latinate-lists.ts";
import { distribution, percentile, sentenceLengths } from "./lengths.ts";
import { mattr, rawTypeTokenRatio } from "./mattr.ts";
import { measureCorpus, targetFrom } from "./prosody.ts";
import { punctuationRates } from "./punctuation.ts";
import { prosodyVersion } from "./version.ts";

/** Deterministic pseudo-prose, long enough for a MATTR window. */
const prose = (words: number, seed = 1): string => {
  const vocabulary = [
    "library",
    "mirror",
    "labyrinth",
    "dust",
    "hexagon",
    "volume",
    "cipher",
    "gallery",
    "shelf",
    "letter",
    "infinite",
    "catalogue",
    "vertigo",
    "clock",
  ];
  const out: string[] = [];
  let state = seed;
  for (let index = 0; index < words; index += 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    out.push(vocabulary[state % vocabulary.length] ?? "word");
    if (index % 12 === 11) {
      out.push(". The");
    }
  }
  return `The ${out.join(" ")}.`;
};

describe("distributions", () => {
  test("p10 <= median <= p90, always", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ max: 200, min: 1 }), { minLength: 1 }),
        (values) => {
          const dist = distribution(values);
          return dist.p10 <= dist.median && dist.median <= dist.p90;
        },
      ),
      { numRuns: 1000 },
    );
  });

  test("identical values have zero spread", () => {
    const dist = distribution([12, 12, 12, 12]);
    expect(dist.stdev).toBe(0);
    expect(dist.p10).toBe(12);
    expect(dist.p90).toBe(12);
  });

  test("percentiles are interpolated, not nearest-rank", () => {
    // Nearest-rank makes a small sample's p90 jump in visible steps as one
    // sentence is added, so the band a verdict is scored against would move for
    // a reason that is about sample size rather than about prose.
    expect(percentile([0, 10], 0.5)).toBe(5);
    expect(percentile([0, 100], 0.9)).toBe(90);
  });

  test("sentence lengths are counted per sentence, hand-checked", () => {
    const text = "One two three. Four five. Six.";
    expect(sentenceLengths(text)).toEqual([3, 2, 1]);
    expect(distribution(sentenceLengths(text)).mean).toBe(2);
  });
});

describe("punctuation rates", () => {
  test("per 1,000 words, hand-checked", () => {
    const text = `${"word ".repeat(999).trim()} end; here`;
    const rates = punctuationRates(text);
    expect(rates.semicolon).toBeCloseTo(1, 1);
  });

  test("an ellipsis is one occurrence however it is written", () => {
    // Counting dots reports three times the rate for a text set in ASCII and
    // once for the same text set typographically — a difference in the edition
    // rather than in the prose.
    const ascii = punctuationRates("one... two three four five");
    const typographic = punctuationRates("one… two three four five");
    expect(ascii.ellipsis).toBeCloseTo(typographic.ellipsis, 6);
  });

  test("a semicolon inside an HTML entity is not punctuation", () => {
    expect(punctuationRates("salt &amp; pepper and more words").semicolon).toBe(
      0,
    );
  });

  test("property: rates are invariant under doubling the text", () => {
    // The property that makes a corpus and a 1,000-word story comparable.
    fc.assert(
      fc.property(fc.integer({ max: 400, min: 50 }), (words) => {
        const text = prose(words);
        const once = punctuationRates(text);
        const twice = punctuationRates(`${text} ${text}`);
        return Math.abs(once.semicolon - twice.semicolon) < 0.001;
      }),
      { numRuns: 200 },
    );
  });
});

describe("MATTR, and why it replaced raw TTR", () => {
  test("raw TTR falls as length rises — the bug MATTR removes", () => {
    // Heaps' law: a property of counting, not of the author. Scoring a
    // 900,000-word corpus against a 1,000-word story on raw TTR reports every
    // short story as more lexically various than every novelist.
    const short = prose(1200, 7);
    const long = prose(12_000, 7);
    expect(rawTypeTokenRatio(long)).toBeLessThan(rawTypeTokenRatio(short));
  });

  test("MATTR does not, on the same two texts", () => {
    const short = mattr(prose(1200, 7)).value;
    const long = mattr(prose(12_000, 7)).value;
    expect(Math.abs(long - short)).toBeLessThan(0.05);
  });

  test("property: MATTR is invariant under repeating a text", () => {
    fc.assert(
      fc.property(fc.integer({ max: 40, min: 1 }), (seed) => {
        const text = prose(2500, seed);
        const once = mattr(text).value;
        const twice = mattr(`${text} ${text}`).value;
        return Math.abs(once - twice) < 0.02;
      }),
      { numRuns: 40 },
    );
  });

  test("a text under one window is flagged rather than compared", () => {
    // Flash length is about 1,000 words, so this is the common case rather
    // than an edge one.
    const result = mattr(prose(300));
    expect(result.insufficientLength).toBe(true);
    expect(result.value).toBeGreaterThan(0);
  });

  test("a text over one window is not flagged", () => {
    expect(mattr(prose(2000)).insufficientLength).toBe(false);
  });
});

describe("dialogue ratio measures against the convention in use", () => {
  test("double quotes", () => {
    const text = '"Yes and no," he said, and then walked out of the room.';
    expect(dialogueRatio(text, "double").value).toBeCloseTo(3 / 12, 2);
  });

  test("an em-dash text is measured, not reported as zero", () => {
    // Measuring against quotation marks reports 0.0 here, and 0.0 looks like a
    // measurement rather than like a mistake.
    const text = ["—Yes and no, he said.", "She did not answer him."].join(
      "\n",
    );
    const ratio = dialogueRatio(text, "em-dash").value ?? 0;
    expect(ratio).toBeGreaterThan(0);
  });

  test("mixed and none have no ratio at all, rather than a ratio of zero", () => {
    // undefined is not scored; zero would be scored, and would fail.
    expect(dialogueRatio("anything", "mixed").value).toBeUndefined();
    expect(dialogueRatio("anything", "none").value).toBeUndefined();
  });

  test("the ratio never exceeds 1", () => {
    expect(dialogueRatio('"all of it"', "double").value).toBeLessThanOrEqual(1);
  });
});

describe("the latinate proxy", () => {
  test.each([
    ["information", true],
    ["development", true],
    ["curiosity", true],
    ["furious", true],
    ["narrative", true],
    ["table", false],
    ["give", false],
    ["went", false],
    ["house", false],
    ["all", false],
    ["the", false],
    ["ate", false],
  ])("%s is latinate: %s", (word, expected) => {
    expect(isLatinate(word)).toBe(expected);
  });

  test("every Germanic exception is classified as not latinate", () => {
    // The list is where a suffix rule does its worst damage: `table`, `late`
    // and `give` are among the most frequent words in English, so
    // misclassifying them moves the ratio for every text rather than a few.
    for (const word of GERMANIC_EXCEPTIONS) {
      expect(isLatinate(word)).toBe(false);
    }
  });

  test("very short words are never classified", () => {
    // `all`, `ate` and `ic` are suffixes standing alone.
    for (const word of ["all", "ate", "ic", "al", "ive"]) {
      expect(isLatinate(word)).toBe(false);
    }
  });

  test("the ratio is exhaustive, not sampled — it is reproducible", () => {
    const text = prose(3000, 3);
    expect(latinateRatio(text)).toBe(latinateRatio(text));
  });

  test("scoreClassifier reports precision and recall", () => {
    const report = scoreClassifier([
      { latinate: true, type: "information" },
      { latinate: true, type: "development" },
      { latinate: false, type: "table" },
      { latinate: false, type: "went" },
      { latinate: true, type: "dark" },
    ]);
    expect(report.truePositives).toBe(2);
    expect(report.falsePositives).toBe(0);
    expect(report.falseNegatives).toBe(1);
    expect(report.precision).toBe(1);
    expect(report.recall).toBeCloseTo(2 / 3, 5);
  });
});

describe("the latinate gate is read, never counted", () => {
  test("it ships scored and unvalidated", () => {
    // The validation set cannot be drawn in this environment, and a set
    // assembled from memory then scored against a classifier tuned to match it
    // is the exact failure the gate exists to prevent. So the measure is
    // scored and every verdict says it is an unvalidated proxy.
    const gate = latinateGate();
    expect(gate.scored).toBe(true);
    expect(gate.validated).toBe(false);
  });

  test("the threshold is 0.85, per §4.3", () => {
    expect(PRECISION_THRESHOLD).toBe(0.85);
  });
});

describe("common bigrams are evidence, and reproducible", () => {
  test("stopword-only pairs are dropped and mixed pairs are kept", () => {
    // Dropping any bigram containing a stopword would delete `the library`,
    // which is exactly the kind of pair that carries a voice.
    const text = "of the of the the library the library the library dust";
    const bigrams = commonBigrams(text);
    expect(bigrams).toContain("the library");
    expect(bigrams).not.toContain("of the");
  });

  test("ties break alphabetically, so work order cannot change a card", () => {
    // Insertion order depends on where in the corpus a phrase first appears,
    // which would make a card change because its works were fetched in a
    // different order. Comparing two orderings of the same text does not
    // isolate this — reversing the halves changes which bigrams span the join,
    // so the counts genuinely differ. Assert the tie-break directly instead.
    //
    // In this text `alpha dust`, `dust alpha` and `zebra dust` each occur
    // twice and `dust zebra` once, so the first three must come out
    // alphabetically and the singleton last.
    const bigrams = commonBigrams(
      "zebra dust alpha dust zebra dust alpha dust",
    );
    expect(bigrams.slice(0, 3)).toEqual([
      "alpha dust",
      "dust alpha",
      "zebra dust",
    ]);
    expect(bigrams.at(-1)).toBe("dust zebra");
  });

  test("at most 25", () => {
    expect(commonBigrams(prose(4000)).length).toBeLessThanOrEqual(25);
  });
});

describe("corpus assembly", () => {
  const works = [
    { id: "gutenberg:1", text: prose(2000, 1) },
    { id: "gutenberg:2", text: prose(2000, 2) },
    { id: "gutenberg:3", text: prose(2000, 3) },
  ];

  test("perWork carries one entry per work", () => {
    const block = measureCorpus(works);
    expect(Object.keys(block.perWork).sort()).toEqual([
      "gutenberg:1",
      "gutenberg:2",
      "gutenberg:3",
    ]);
  });

  test("the aggregate is over concatenated text, not an average of works", () => {
    // Averaging would weight a 2,000-word sketch equally with a 90,000-word
    // novel, so a card's mean sentence length would move when a short piece was
    // added — a fact about the file list rather than about the author.
    const uneven = [
      { id: "long", text: prose(6000, 1) },
      { id: "short", text: "Short. Very short. Tiny." },
    ];
    const block = measureCorpus(uneven);
    const naiveAverage =
      Object.values(block.perWork).reduce(
        (sum, work) => sum + work.sentenceLength.mean,
        0,
      ) / 2;
    expect(block.sentenceLength.mean).not.toBeCloseTo(naiveAverage, 1);
  });

  test("words is the total across works", () => {
    const block = measureCorpus(works);
    const perWorkTotal = Object.values(block.perWork).reduce(
      (sum, work) => sum + work.words,
      0,
    );
    expect(block.words).toBe(perWorkTotal);
  });

  test("the target equals the measurement, field for field", () => {
    // §4.6: nothing writes an overlay in v1. The tension the design's mockup
    // points at is handled by a clause in the draft prompt, so the report keeps
    // one basis and the drift is visible rather than hidden.
    const block = measureCorpus(works);
    const target = targetFrom(block);
    expect(target.sentenceLength).toEqual(block.sentenceLength);
    expect(target.punctuation).toEqual(block.punctuation);
    expect(target.mattr).toBe(block.mattr);
    expect(target.latinateRatio).toBe(block.latinateRatio);
    expect(target.dialogueRatio).toBe(block.dialogueRatio);
  });
});

describe("the version is derived from everything that decides a number", () => {
  test("it is stable", () => {
    expect(prosodyVersion()).toBe(prosodyVersion());
  });

  test("it includes the segmenter's version", async () => {
    // Every measure here is computed over the segmenter's output: changing
    // where sentences end changes mean sentence length without changing a line
    // of this package.
    const source = await Bun.file(
      new URL("./version.ts", import.meta.url),
    ).text();
    expect(source).toContain("segmenterVersion()");
    expect(source).toContain("LATINATE_SUFFIXES");
    expect(source).toContain("MATTR_WINDOW");
  });
});
