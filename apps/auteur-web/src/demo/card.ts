import type { StyleCard } from "@auteur/core/style-card";
import { measureCorpus } from "@auteur/prosody/prosody";
import { buildCard } from "@auteur/style-card/build";

/**
 * The demo's style card, built by the same function the pipeline uses.
 *
 * Not a hand-written object cast to `StyleCard`. `buildCard` refuses a card
 * that is missing a required claim or carries a derived claim with no citation
 * (invariant 2), so a demo assembled any other way could show a card the
 * product would reject — which is the opposite of what a demo is for.
 *
 * The prosody is **measured**, from the same passage text the exemplars quote.
 * Inventing numbers here would put a fabricated measurement on the one screen
 * whose whole argument is that measurements are not invented.
 */

const WORK_ID = "gutenberg:2350";
const WORK_TITLE = "Ward No. 6";

/** Enough real prose for MATTR and the sentence distribution to mean something. */
const PASSAGE = [
  "In the hospital yard there stands a small lodge surrounded by a perfect forest of burdocks, nettles, and wild hemp.",
  "Its roof is rusty, the chimney is tumbling down, the steps at the front-door are rotting away and overgrown with grass, and there are only traces left of the stucco.",
  "The front of the lodge faces the hospital; at the back it looks out into the open country, from which it is separated by the grey hospital fence with nails on it.",
  "These nails, with their points upwards, and the fence, and the lodge itself, have that peculiar, desolate, God-forsaken look which is only found in our hospital and prison buildings.",
  "If you are not afraid of being stung by the nettles, come by the narrow footpath that leads to the lodge, and let us see what is going on inside.",
].join(" ");

const passageId = (ordinal: number): string =>
  `01a07f00-0000-7000-8000-00000000000${ordinal.toString()}`;

const citation = (ordinal: number) => ({
  passageId: passageId(ordinal),
  workId: WORK_ID,
  workTitle: WORK_TITLE,
});

/** One claim per required path. Every one cited, because every one is derived. */
const SINGULAR: readonly (readonly [string, string])[] = [
  [
    "dialogue.dialectRendering",
    "spelled straight; class is carried by syntax, not by phonetic spelling",
  ],
  [
    "dialogue.speechToNarrationBalance",
    "narration-heavy; speech arrives in short bursts",
  ],
  [
    "dialogue.tagConventions",
    "plain 'said', almost never modified by an adverb",
  ],
  ["diction.concreteness", "concrete and physical — rust, nettles, nails"],
  [
    "diction.register",
    "plain, unliterary, close to spoken Russian in translation",
  ],
  [
    "rhythm.repetitionHabits",
    "a noun repeated across clauses rather than replaced by a pronoun",
  ],
  [
    "structure.sceneVsSummary",
    "scene, entered late and left before its resolution",
  ],
  [
    "voice.freeIndirect",
    "frequent; the narrator borrows a character's judgement without marking it",
  ],
  [
    "voice.narratorDistance",
    "close but unsentimental; observes without commenting",
  ],
  ["voice.pov", "third person limited"],
  ["voice.reliability", "reliable, and deliberately incurious"],
  [
    "voice.tense",
    "past, with an occasional present-tense address to the reader",
  ],
];

const PLURAL: readonly (readonly [string, readonly string[]])[] = [
  [
    "antiPatterns",
    [
      "a summarising final paragraph",
      "an adverb after 'said'",
      "a metaphor that explains itself",
    ],
  ],
  ["diction.avoidedRegisters", ["the ornate", "the consciously poetic"]],
  ["diction.signatureLexicon", ["yard", "lodge", "fence", "grey"]],
  [
    "imagery.motifs",
    ["enclosure", "the fence and what is on the other side of it"],
  ],
  [
    "imagery.preoccupations",
    ["institutions and the people inside them", "boredom as a moral condition"],
  ],
  [
    "imagery.recurringImages",
    ["nettles and burdock", "rust", "a nail with its point upwards"],
  ],
  [
    "rhythm.devices",
    ["the accumulating list", "a long sentence closed by a short one"],
  ],
  [
    "structure.closingMoves",
    ["stopping before the consequence", "a last small physical detail"],
  ],
  ["structure.openingMoves", ["a place, described before anyone is in it"]],
  [
    "structure.typicalShapes",
    ["a situation examined rather than a plot resolved"],
  ],
];

const EXEMPLARS = [
  "the sentence-length floor",
  "the accumulating list",
  "plain 'said'",
  "free indirect judgement",
  "a concrete noun where an abstraction would do",
  "the unresolved close",
  "narration over speech",
  "the second-person address",
];

export const demoCard = (): StyleCard =>
  buildCard({
    author: {
      birthYear: 1860,
      deathYear: 1904,
      displayName: "Chekhov, Anton Pavlovich",
      id: "gutenberg:chekhov-anton-pavlovich-1860",
      kind: "full-text",
    },
    evidence: [
      ...SINGULAR.map(([path, value], index) => ({
        citation: citation((index % 8) + 1),
        path,
        value,
      })),
      ...PLURAL.map(([path, value], index) => ({
        citation: citation((index % 8) + 1),
        path,
        value,
      })),
    ],
    exemplars: EXEMPLARS.map((demonstrates, index) => ({
      demonstrates,
      passageId: passageId(index + 1),
      workId: WORK_ID,
      workTitle: WORK_TITLE,
      year: 1892,
    })),
    prosody: measureCorpus([{ id: WORK_ID, text: PASSAGE.repeat(40) }]),
    sources: [
      {
        id: WORK_ID,
        title: WORK_TITLE,
        translator: "Constance Garnett",
        wordCount: 24_118,
        year: 1892,
      },
    ],
    // Fixed strings, not `cleanerVersion()` and friends. Those hash their
    // inputs with `Bun.hash`, which does not exist in a browser — importing
    // them here put `Bun is not defined` on a blank page, which is how this
    // was found. A demo's toolchain line is a label; the real one comes from
    // the card the pipeline built.
    toolchain: {
      cleaner: "demo",
      prosody: "demo",
      segmenter: "demo",
    },
    version: 3,
  });

export const DEMO_PASSAGE = PASSAGE;
