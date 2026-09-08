import type { ProsodyBlock, WorkProsody } from "@auteur/core/prosody";
import type { AuthorRef, Exemplar, WorkRef } from "@auteur/core/style-card";
import type { BuildInput, Evidence } from "./build.ts";

/**
 * A card's worth of fixture, shared by this package's tests.
 *
 * Not exported from the package — `packages.manifest.ts` declares four
 * subpaths and this is not one of them, so it is not in the public surface. It
 * is here rather than in each test file because a card has fourteen claim
 * fields and eight exemplars, and four copies of that would be four things to
 * keep in agreement.
 */

export const AUTHOR: AuthorRef = {
  birthYear: 1899,
  deathYear: 1986,
  displayName: "Jorge Luis Borges",
  id: "gutenberg:borges-jorge-luis-1899",
  kind: "full-text",
};

const CORPUS: WorkProsody = {
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

export const PROSODY: ProsodyBlock = {
  ...CORPUS,
  commonBigrams: ["the labyrinth", "a mirror"],
  dialogueMarker: "double",
  perWork: {
    "gutenberg:1": { ...CORPUS, words: 130_000 },
    "gutenberg:2": { ...CORPUS, words: 84_000 },
  },
};

export const SOURCES: readonly WorkRef[] = [
  { id: "gutenberg:1", title: "Ficciones", wordCount: 130_000, year: 1944 },
  { id: "gutenberg:2", title: "The Aleph", wordCount: 84_000, year: 1949 },
];

const passage = (n: number): string =>
  `b1c9f2e0-0000-7000-8000-abcdefabcde${n.toString(16)}`;

export const EXEMPLARS: readonly Exemplar[] = Array.from(
  { length: 9 },
  (_, index) => ({
    demonstrates: `move ${(index + 1).toString()}`,
    passageId: passage(index),
    workId: "gutenberg:1",
    workTitle: "Ficciones",
    year: 1944,
  }),
);

const cite = (n: number) => ({
  passageId: passage(n),
  workId: "gutenberg:1",
  workTitle: "Ficciones",
});

/** Every claim field the schema requires, each cited. */
export const EVIDENCE: readonly Evidence[] = [
  { citation: cite(0), path: "antiPatterns", value: ["no dream reveals"] },
  { citation: cite(0), path: "dialogue.dialectRendering", value: "unmarked" },
  {
    citation: cite(1),
    path: "dialogue.speechToNarrationBalance",
    value: "narration carries almost everything",
  },
  { citation: cite(2), path: "dialogue.tagConventions", value: "said, bare" },
  { citation: cite(3), path: "diction.avoidedRegisters", value: ["slang"] },
  {
    citation: cite(4),
    path: "diction.concreteness",
    value: "abstraction beside a concrete noun",
  },
  { citation: cite(5), path: "diction.register", value: "formal, Latinate" },
  { citation: cite(6), path: "diction.signatureLexicon", value: ["labyrinth"] },
  { citation: cite(7), path: "imagery.motifs", value: ["mirrors"] },
  { citation: cite(8), path: "imagery.preoccupations", value: ["infinity"] },
  { citation: cite(0), path: "imagery.recurringImages", value: ["the tiger"] },
  { citation: cite(1), path: "rhythm.devices", value: ["the triple"] },
  {
    citation: cite(2),
    path: "rhythm.repetitionHabits",
    value: "restates a phrase transformed",
  },
  {
    citation: cite(3),
    path: "structure.closingMoves",
    value: ["the footnote"],
  },
  {
    citation: cite(4),
    path: "structure.openingMoves",
    value: ["the catalogue"],
  },
  {
    citation: cite(5),
    path: "structure.sceneVsSummary",
    value: "summary, almost throughout",
  },
  { citation: cite(6), path: "structure.typicalShapes", value: ["the frame"] },
  { citation: cite(7), path: "voice.freeIndirect", value: "rare" },
  { citation: cite(8), path: "voice.narratorDistance", value: "far" },
  { citation: cite(0), path: "voice.pov", value: "first, retrospective" },
  { citation: cite(1), path: "voice.reliability", value: "scholarly, hedged" },
  { citation: cite(2), path: "voice.tense", value: "past" },
];

export const buildInput = (
  overrides: Partial<BuildInput> = {},
): BuildInput => ({
  author: AUTHOR,
  evidence: EVIDENCE,
  exemplars: EXEMPLARS,
  prosody: PROSODY,
  sources: SOURCES,
  toolchain: { cleaner: "clean-a1", prosody: "pros-b2", segmenter: "seg-c3" },
  version: 1,
  ...overrides,
});
