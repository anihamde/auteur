import { describe, expect, test } from "bun:test";
import type { WorkProsody } from "@auteur/core/prosody";
import { clarify } from "./clarify.ts";
import { corpusSelect } from "./corpus-select.ts";
import { outline } from "./outline.ts";
import { story } from "./story.ts";
import { styleExtract } from "./style-extract.ts";
import { styleFields } from "./style-fields.ts";
import { summarizeBeat } from "./summarize-beat.ts";

/**
 * A snapshot per prompt.
 *
 * Snapshots here are not a correctness check — nothing decides whether a prompt
 * is good. They are a **diff surface**: a prompt edit is exactly the kind of
 * change that is invisible in a pull request unless the rendered result is in
 * it, and `extractionPromptVersion` is in a card's cache key, so an edit that
 * looked like a typo fix invalidates every card that prompt built.
 *
 * So the rule the snapshot enforces is procedural: if this file's output
 * changed, the version in `versions.ts` changes with it, and the diff shows
 * both.
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

const CARD = [
  "voice.pov: close third, one consciousness per story",
  "diction.register: Latinate abstraction beside a concrete noun",
].join("\n");

describe("rendered prompts", () => {
  test("corpus-select", () => {
    expect(
      corpusSelect.build({
        authorName: "Jorge Luis Borges",
        limit: 12,
        works: [
          {
            firstPassage: "I owe the discovery of Uqbar to the conjunction.",
            id: "gutenberg:1",
            title: "Ficciones",
            wordCount: 40_000,
            year: 1944,
          },
          {
            firstPassage: "The man arrived from the south one night.",
            id: "gutenberg:2",
            title: "The Aleph",
            wordCount: 38_000,
            year: 1949,
          },
        ],
      }),
    ).toMatchSnapshot();
  });

  test("style-fields", () => {
    expect(
      styleFields.build({
        authorName: "Jorge Luis Borges",
        passages: [
          {
            id: "b1c9f2e0-0000-7000-8000-abcdefabcdef",
            text: "The lamp turned. The sea did not.",
            workTitle: "Ficciones",
          },
        ],
        prosody: PROSODY,
      }),
    ).toMatchSnapshot();
  });

  test("style-extract", () => {
    expect(
      styleExtract.build({
        authorName: "Jorge Luis Borges",
        passages: [
          {
            id: "b1c9f2e0-0000-7000-8000-abcdefabcdef",
            text: "The lamp turned. The sea did not.",
            workTitle: "Ficciones",
          },
        ],
        readings: [
          { path: "voice.pov", value: "first, retrospective" },
          { path: "antiPatterns", value: "no epigraphs" },
        ],
      }),
    ).toMatchSnapshot();
  });

  test("clarify", () => {
    expect(
      clarify.build({
        answers: [
          {
            answer: "the catalogue frame",
            decision: "which frame the story takes",
            question: "Whose account are we reading?",
          },
          {
            answer: null,
            decision: "whether the comet is seen",
            question: "Does anyone witness it?",
          },
        ],
        authorName: "Jorge Luis Borges",
        cardSummary: CARD,
        constraints: "no dialogue",
        idea: "a lighthouse keeper who has never seen the sea",
        lengthPreset: "flash",
        round: 2,
      }),
    ).toMatchSnapshot();
  });

  test("outline", () => {
    expect(
      outline.build({
        answers: [
          {
            answer: "the catalogue frame",
            decision: "which frame the story takes",
            question: "Whose account are we reading?",
          },
        ],
        authorName: "Jorge Luis Borges",
        cardSummary: CARD,
        constraints: null,
        idea: "a lighthouse keeper who has never seen the sea",
        lengthPreset: "flash",
        wordTarget: 1000,
      }),
    ).toMatchSnapshot();
  });

  test("story, single call", () => {
    expect(
      story.build({
        antiPatterns: ["no dream reveals", "no twist in the final line"],
        authorName: "Jorge Luis Borges",
        beats: [
          { index: 1, text: "The catalogue names a comet nobody saw." },
          { index: 2, text: "The keeper reads the entry." },
        ],
        cardSummary: CARD,
        exemplars: [
          {
            demonstrates: "the catalogue frame",
            text: "The lamp turned. The sea did not.",
            workTitle: "Ficciones",
          },
        ],
        lengthPreset: "flash",
        targets:
          "sentence length mean 28.4 (p10 9, p90 52); semicolons 11.2/1k",
        title: "The Return of the Comet",
        wordTarget: 1000,
      }),
    ).toMatchSnapshot();
  });

  test("story, rewritten from notes", () => {
    expect(
      story.build({
        antiPatterns: [],
        authorName: "Jorge Luis Borges",
        beats: [{ index: 1, text: "The catalogue names a comet." }],
        cardSummary: CARD,
        exemplars: [],
        lengthPreset: "flash",
        previous: {
          notes: [
            "The middle drags. Cut the second scene to half.",
            "And give the ending more room.",
          ],
          story: "The lamp turned. The sea did not.",
        },
        targets: "sentence length mean 28.4",
        title: "The Return of the Comet",
        wordTarget: 1000,
      }),
    ).toMatchSnapshot();
  });

  test("story, sequential scene", () => {
    expect(
      story.build({
        antiPatterns: [],
        authorName: "Jorge Luis Borges",
        beats: [
          { index: 1, text: "The catalogue names a comet." },
          { index: 2, text: "The keeper reads the entry." },
        ],
        cardSummary: CARD,
        continuity: "The keeper is called Ansel. It is late autumn.",
        exemplars: [],
        lengthPreset: "long",
        scope: [{ index: 2, text: "The keeper reads the entry." }],
        targets: "sentence length mean 28.4",
        title: "The Return of the Comet",
        wordTarget: 12_000,
      }),
    ).toMatchSnapshot();
  });

  test("summarize-beat", () => {
    expect(
      summarizeBeat.build({
        scenesSoFar: [
          "The catalogue named a comet nobody saw.",
          "Ansel read the entry twice and set the lamp turning.",
        ],
        title: "The Return of the Comet",
      }),
    ).toMatchSnapshot();
  });
});
