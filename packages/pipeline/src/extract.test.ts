import { describe, expect, test } from "bun:test";
import type { ProsodyBlock, WorkProsody } from "@auteur/core/prosody";
import type { AuthorRef, WorkRef } from "@auteur/core/style-card";
import { CLAIM_PATHS, EXEMPLARS } from "@auteur/core/style-card";
import {
  cardFromExtraction,
  type Extraction,
  type PassageRef,
  parseExtraction,
  toEvidence,
  toExemplars,
} from "./extract.ts";

const AUTHOR: AuthorRef = {
  birthYear: 1899,
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

const PROSODY: ProsodyBlock = {
  ...CORPUS,
  commonBigrams: ["the labyrinth"],
  dialogueMarker: "double",
  perWork: { "gutenberg:1": CORPUS },
};

const SOURCES: readonly WorkRef[] = [
  { id: "gutenberg:1", title: "Ficciones", wordCount: 214_000, year: 1944 },
];

/**
 * Every claim field `styleCardSchema` requires, each cited.
 *
 * From `CLAIM_PATHS` rather than retyped: this list and the schema have to
 * agree, and the card built below is what proves they do — a path added to the
 * schema and not to `CLAIM_PATHS` fails this build, which is the only check
 * either side has.
 */
const ALL_PATHS = CLAIM_PATHS.map((claim) => claim.path);

const PLURAL = new Set(
  CLAIM_PATHS.filter((claim) => claim.kind === "list").map(
    (claim) => claim.path,
  ),
);

const passage = (n: number): string =>
  `b1c9f2e0-0000-7000-8000-abcdefabcde${n.toString(16)}`;

const PASSAGES: readonly PassageRef[] = Array.from(
  { length: 9 },
  (_, index) => ({
    id: passage(index),
    workId: "gutenberg:1",
    workTitle: "Ficciones",
    year: 1944,
  }),
);

const extraction = (overrides: Partial<Extraction> = {}): Extraction => ({
  exemplars: PASSAGES.map((entry, index) => ({
    demonstrates: `move ${(index + 1).toString()}`,
    passageId: entry.id,
  })),
  fields: [
    {
      citationPassageId: passage(0),
      path: "voice.pov",
      value: "first, retrospective",
    },
  ],
  ...overrides,
});

const everyField = (cited = true) =>
  ALL_PATHS.map((path, index) => ({
    ...(cited && { citationPassageId: passage(index % 9) }),
    path,
    value: PLURAL.has(path) ? [`a reading of ${path}`] : `a reading of ${path}`,
  }));

describe("the stage's output is parsed, never cast", () => {
  test("a result missing exemplars does not parse", () => {
    expect(() => parseExtraction({ exemplars: [], fields: [] })).toThrow(
      "not a card",
    );
  });

  test("a citation that is not a uuid does not parse", () => {
    expect(() =>
      parseExtraction({
        exemplars: extraction().exemplars,
        fields: [
          { citationPassageId: "passage 1", path: "voice.pov", value: "x" },
        ],
      }),
    ).toThrow("not a card");
  });

  test("a valid result parses", () => {
    expect(() => parseExtraction(extraction())).not.toThrow();
  });
});

describe("a citation naming a passage nobody offered is dropped", () => {
  test("the field survives as an uncited attempt", () => {
    // The model was given the ids; one it invented points at nothing. Carrying
    // it forward would put a citation on the card that resolves to no passage
    // — invariant 2 failing in the one way a reader cannot detect, because the
    // mark is there and the link is dead.
    const evidence = toEvidence(
      extraction({
        fields: [
          {
            citationPassageId: "c1c9f2e0-0000-7000-8000-abcdefabcdef",
            path: "voice.pov",
            value: "first",
          },
        ],
      }),
      PASSAGES,
    );
    expect(evidence[0]?.citation).toBeUndefined();
    expect(evidence[0]?.value).toBe("first");
  });

  test("an explicit null is an uncited field, not a parse failure", () => {
    // Strict `json_schema` has no optional property: every key is required, so
    // a field with no citation to give can only send `null`. A schema that
    // accepted `undefined` alone failed the parse of the *whole* extraction
    // over one uncited field, which is a stage that fails for a card it had
    // already built correctly.
    const payload = extraction({
      fields: [{ citationPassageId: null, path: "voice.pov", value: "first" }],
    });
    expect(() => parseExtraction(payload)).not.toThrow();
    const evidence = toEvidence(parseExtraction(payload), PASSAGES);
    expect(evidence[0]?.citation).toBeUndefined();
    expect(evidence[0]?.value).toBe("first");
  });

  test("an offered id resolves to the work it belongs to", () => {
    // The stage returns a passage id only. It is not given work titles in a
    // form it could reliably echo, and asking it to is how a citation ends up
    // naming a work the passage does not belong to.
    const evidence = toEvidence(extraction(), PASSAGES);
    expect(evidence[0]?.citation).toEqual({
      passageId: passage(0),
      workId: "gutenberg:1",
      workTitle: "Ficciones",
    });
  });

  test("an exemplar citing an unknown passage is dropped entirely", () => {
    // Unlike a field, an exemplar *is* its citation: there is nothing left of
    // it without one.
    const exemplars = toExemplars(
      extraction({
        exemplars: [
          { demonstrates: "a", passageId: passage(0) },
          {
            demonstrates: "b",
            passageId: "c1c9f2e0-0000-7000-8000-abcdefabcdef",
          },
        ],
      }),
      PASSAGES,
    );
    expect(exemplars).toHaveLength(1);
    expect(exemplars[0]?.workTitle).toBe("Ficciones");
  });
});

describe("the full path produces a card whose citations resolve", () => {
  test("every derived field cites a passage that was offered", () => {
    // K5's proof, against no provider at all: the extraction is data, the
    // passages are data, and the card is what falls out.
    const card = cardFromExtraction({
      author: AUTHOR,
      extraction: extraction({ fields: everyField() }),
      passages: PASSAGES,
      prosody: PROSODY,
      sources: SOURCES,
      toolchain: {
        cleaner: "clean-a1",
        prosody: "pros-b2",
        segmenter: "seg-c3",
      },
      version: 1,
    });

    const offered = new Set(PASSAGES.map((entry) => entry.id));
    expect(card.voice.pov.citation).toBeDefined();
    expect(offered.has(card.voice.pov.citation?.passageId ?? "")).toBe(true);
    expect(card.confidence).toBe(1);
    expect(card.exemplars).toHaveLength(9);
  });

  test("an extraction that cannot cite a required field does not produce a card", () => {
    // Decision 0004: the correct failure for a card that cannot keep its own
    // promise.
    expect(() =>
      cardFromExtraction({
        author: AUTHOR,
        extraction: extraction({ fields: everyField(false) }),
        passages: PASSAGES,
        prosody: PROSODY,
        sources: SOURCES,
        toolchain: {
          cleaner: "clean-a1",
          prosody: "pros-b2",
          segmenter: "seg-c3",
        },
        version: 1,
      }),
    ).toThrow("not a valid card");
  });

  test("the prosody block is carried whole and the target equals it", () => {
    const card = cardFromExtraction({
      author: AUTHOR,
      extraction: extraction({ fields: everyField() }),
      passages: PASSAGES,
      prosody: PROSODY,
      sources: SOURCES,
      toolchain: {
        cleaner: "clean-a1",
        prosody: "pros-b2",
        segmenter: "seg-c3",
      },
      version: 1,
    });
    expect(card.prosody).toEqual(PROSODY);
    expect(card.prosodyTarget.sentenceLength).toEqual(PROSODY.sentenceLength);
  });
});

describe("more exemplars than the card has room for", () => {
  test("the extras are dropped, not the whole answer", () => {
    // Strict `json_schema` has no `maxItems`, so the gateway cannot hold a
    // model to the range and only this can. It threw — and a model that
    // returned seventeen good exemplars when asked for up to fifteen had its
    // whole answer discarded, along with the forty seconds that produced it.
    const tooMany = extraction({
      exemplars: Array.from({ length: EXEMPLARS.max + 4 }, (_, index) => ({
        demonstrates: `a habit, number ${index.toString()}`,
        passageId: passage(index % 9),
      })),
    });
    const parsed = parseExtraction(tooMany);
    expect(parsed.exemplars).toHaveLength(EXEMPLARS.max);
  });

  test("too few is still a failure, because the card promises eight", () => {
    // A card with three exemplars is a card that cannot keep its own promise,
    // and dropping is not available in that direction.
    expect(() =>
      parseExtraction(
        extraction({
          exemplars: [{ demonstrates: "one", passageId: passage(0) }],
        }),
      ),
    ).toThrow();
  });
});
