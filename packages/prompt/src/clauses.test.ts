import { describe, expect, test } from "bun:test";
import type { WorkProsody } from "@auteur/core/prosody";
import { clarify } from "./clarify.ts";
import { corpusSelect } from "./corpus-select.ts";
import { critique } from "./critique.ts";
import { draft } from "./draft.ts";
import { outline } from "./outline.ts";
import { revise } from "./revise.ts";
import { styleExtract } from "./style-extract.ts";
import { summarizeBeat } from "./summarize-beat.ts";

/**
 * The named clauses, each asserted by its sentinel phrase.
 *
 * A prompt is prose, so most of it cannot be tested. What can be is that the
 * clauses the plan named are still in it — someone tightening the wording is
 * welcome, and someone deleting the precedence clause is not, and only the
 * second should fail.
 *
 * Every determinism check is here too: `build` is a pure function of its input,
 * which is the property the card's `buildKey` assumes when it treats a prompt
 * version as determining a prompt string.
 */

const PROSODY: WorkProsody = {
  dialogueRatio: 0.06,
  latinateRatio: 0.34,
  mattr: 0.48,
  paragraphLength: { mean: 92, median: 84 },
  punctuation: {
    colon: 2.1,
    ellipsis: 0.4,
    emDash: 8.4,
    exclamation: 0.2,
    question: 1.1,
    semicolon: 11.2,
  },
  sentenceLength: { mean: 28.4, median: 26, p10: 9, p90: 52, stdev: 14.2 },
  words: 214_000,
};

const CASES = [
  {
    build: () =>
      corpusSelect.build({
        authorName: "Jorge Luis Borges",
        limit: 12,
        works: [
          {
            firstPassage: "The lamp turned.",
            id: "gutenberg:1",
            title: "Ficciones",
            wordCount: 40_000,
            year: 1944,
          },
        ],
      }),
    clauses: {
      reason: "names the work and the criterion",
      spread: "across the years available",
      translator: "two translators are",
    },
    name: "corpus-select",
  },
  {
    build: () =>
      styleExtract.build({
        authorName: "Jorge Luis Borges",
        passages: [
          { id: "p1", text: "The lamp turned.", workTitle: "Ficciones" },
        ],
        prosody: PROSODY,
      }),
    clauses: {
      cite: "never with an invented id",
      "no-prosody": "Do not return any of",
      // Naming the card's fields is the difference between a card and no card:
      // asked in prose for "the qualitative half of a style card", the model
      // returned no fields at all.
      paths: "- `voice.pov` (line)",
    },
    name: "style-extract",
  },
  {
    build: () =>
      clarify.build({
        answers: [],
        authorName: "Borges",
        cardSummary: "a card",
        constraints: null,
        idea: "a comet",
        lengthPreset: "flash",
        round: 1,
      }),
    clauses: {
      "from-the-card": "would be asked of any author is not asked",
      purpose: "cannot name the decision it resolves is not asked",
      suggestions: 'Never "it depends"',
    },
    name: "clarify",
  },
  {
    build: () =>
      outline.build({
        answers: [],
        authorName: "Borges",
        cardSummary: "a card",
        constraints: null,
        idea: "a comet",
        lengthPreset: "flash",
        wordTarget: 1000,
      }),
    clauses: {
      "not-asked": "decisions the reader did not know were being made",
      shape: "Choose a count the length can carry",
    },
    name: "outline",
  },
  {
    build: () =>
      draft.build({
        antiPatterns: ["no dream reveals"],
        authorName: "Borges",
        beats: [{ index: 1, text: "the comet returns" }],
        cardSummary: "a card",
        exemplars: [
          {
            demonstrates: "the catalogue frame",
            text: "The lamp turned.",
            workTitle: "Ficciones",
          },
        ],
        lengthPreset: "flash",
        targets: "sentence length mean 28.4",
        title: "The Return",
        wordTarget: 1000,
      }),
    clauses: {
      "anti-patterns": "not suggestions and not a stylistic preference",
      "no-label": "Writing your own version of it here produces two",
      precedence: "the story wins, and the drift is",
    },
    name: "draft",
  },
  {
    build: () =>
      critique.build({
        authorName: "Borges",
        cardSummary: "a card",
        draft: "The lamp turned.",
        measures: [
          {
            path: "prosodyTarget.sentenceLength.mean",
            status: "drift",
            target: "28.4",
            value: "18.2",
          },
        ],
      }),
    clauses: {
      number: "dropped by the engine",
      path: "names a path from the card",
    },
    name: "critique",
  },
  {
    build: () =>
      revise.build({
        authorName: "Borges",
        cardSummary: "a card",
        draft: "The lamp turned.",
        remedies: [
          {
            finding: "sentences run short",
            path: "prosodyTarget.sentenceLength.mean",
            remedy: "join three candidate pairs",
          },
        ],
      }),
    clauses: { targeted: "is not the instruction" },
    name: "revise",
  },
  {
    build: () =>
      summarizeBeat.build({ scenesSoFar: ["The lamp turned."], title: "X" }),
    clauses: { carry: "threads left open" },
    name: "summarize-beat",
  },
] as const;

for (const testCase of CASES) {
  describe(testCase.name, () => {
    test.each(Object.entries(testCase.clauses))(
      "carries the %s clause",
      (_clause, sentinel) => {
        expect(testCase.build()).toContain(sentinel);
      },
    );

    test("build is deterministic", () => {
      expect(testCase.build()).toBe(testCase.build());
    });

    test("the built prompt is not a stub", () => {
      // A clause test passes against a file that is nothing but its clauses.
      expect(testCase.build().length).toBeGreaterThan(600);
    });
  });
}

describe("draft's precedence clause is §4.6's sentence, not a paraphrase", () => {
  test("it says the targets describe a corpus and not a quota", () => {
    // The clause exists instead of an overlay that lowers a target. If it
    // weakened to "try to hit these", the drift would stop being explained and
    // the report would argue with itself.
    const built = draft.build({
      antiPatterns: [],
      authorName: "Borges",
      beats: [{ index: 1, text: "b" }],
      cardSummary: "c",
      exemplars: [],
      lengthPreset: "flash",
      targets: "t",
      title: "T",
      wordTarget: 1000,
    });
    expect(built).toContain("describe a corpus, not a quota");
    expect(built).toContain("the story wins, and the drift is");
    expect(built).toContain("will be reported");
    expect(built).toContain("Do not pad to reach a mean");
  });
});

describe("revise's two paths", () => {
  const base = {
    authorName: "Borges",
    cardSummary: "a card",
    draft: "The lamp turned. The sea did not.",
    remedies: [],
  } as const;

  test("the whole-draft path does not mention a marked span", () => {
    expect(revise.build(base)).not.toContain("marked span");
  });

  test("the selection path replaces only the span, character for character", () => {
    // A revision that touched a paragraph the reader did not select is one
    // they cannot undo.
    const built = revise.build({
      ...base,
      after: "The sea did not.",
      before: "Once.",
      span: "The lamp turned.",
    });
    expect(built).toContain("Replace only the marked span");
    expect(built).toContain("identical, character for character");
  });
});

describe("draft under sequential-scene", () => {
  const base = {
    antiPatterns: [],
    authorName: "Borges",
    beats: [
      { index: 1, text: "one" },
      { index: 2, text: "two" },
    ],
    cardSummary: "c",
    exemplars: [],
    lengthPreset: "long" as const,
    targets: "t",
    title: "T",
    wordTarget: 12_000,
  };

  test("continuity and scope appear only when they are given", () => {
    expect(draft.build(base)).not.toContain("What earlier scenes established");
    const scened = draft.build({
      ...base,
      continuity: "The keeper is called Ansel.",
      scope: [{ index: 2, text: "two" }],
    });
    expect(scened).toContain("What earlier scenes established");
    expect(scened).toContain("Ansel");
  });

  test("scope narrows the beats, so a scene call is not handed the whole sheet", () => {
    const scened = draft.build({ ...base, scope: [{ index: 2, text: "two" }] });
    expect(scened).toContain("2. two");
    expect(scened).not.toContain("1. one");
  });
});
