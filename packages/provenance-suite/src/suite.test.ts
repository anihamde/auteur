import { describe, expect, test } from "bun:test";
import type { FitMeasure } from "@auteur/core/fit";
import type { ProsodyBlock, WorkProsody } from "@auteur/core/prosody";
import type { StyleCard } from "@auteur/core/style-card";
import {
  cardProsodyMatches,
  citationsResolve,
  editedMeasuresAppearTwice,
  exportCarriesLabel,
  nothingWritesOverlays,
} from "./suite.ts";

const ROOT = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");

const corpus: WorkProsody = {
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

const block: ProsodyBlock = {
  ...corpus,
  commonBigrams: ["the labyrinth"],
  dialogueMarker: "double",
  perWork: { "gutenberg:1": corpus },
};

const PASSAGE = "b1c9f2e0-0000-7000-8000-abcdefabcdef";

const cardWith = (overrides: Partial<StyleCard> = {}): StyleCard =>
  ({
    exemplars: [
      {
        demonstrates: "the catalogue frame",
        passageId: PASSAGE,
        workId: "gutenberg:1",
        workTitle: "Ficciones",
      },
    ],
    id: "c1c9f2e0-0000-7000-8000-abcdefabcdef",
    prosody: block,
    prosodyTarget: {
      dialogueRatio: block.dialogueRatio,
      latinateRatio: block.latinateRatio,
      mattr: block.mattr,
      punctuation: block.punctuation,
      sentenceLength: block.sentenceLength,
    },
    voice: {
      pov: {
        citation: {
          passageId: PASSAGE,
          workId: "gutenberg:1",
          workTitle: "Ficciones",
        },
        origin: "derived",
        value: "first, retrospective",
      },
    },
    ...overrides,
  }) as unknown as StyleCard;

const known = new Set([PASSAGE]);

describe("invariant 1: a card's prosody is what prosody computed", () => {
  test("a matching card passes", () => {
    expect(cardProsodyMatches(cardWith(), block)).toEqual([]);
  });

  test("a fabricated card whose prosody differs fails", () => {
    // The failure that cannot be seen by reading the card, because a wrong
    // number looks exactly like a right one.
    const fabricated = cardWith({
      prosody: {
        ...block,
        sentenceLength: { ...block.sentenceLength, mean: 12 },
      },
    });
    expect(cardProsodyMatches(fabricated, block)).toHaveLength(2);
  });

  test("a target that differs from the measurement fails, because no v1 path moves one", () => {
    // §4.6: nothing writes an overlay, so a target that has moved got there
    // some other way.
    const moved = cardWith({
      prosodyTarget: {
        dialogueRatio: block.dialogueRatio,
        latinateRatio: block.latinateRatio,
        mattr: block.mattr,
        punctuation: block.punctuation,
        sentenceLength: { ...block.sentenceLength, mean: 24 },
      },
    });
    expect(cardProsodyMatches(moved, block)[0]?.what).toContain("§4.6");
  });
});

describe("invariant 2: every derived claim cites a passage that resolves", () => {
  test("a cited claim pointing at a stored passage passes", () => {
    expect(citationsResolve(cardWith(), known)).toEqual([]);
  });

  test("an uncited derived claim fails", () => {
    const uncited = cardWith({
      voice: {
        pov: { origin: "derived", value: "first" },
      } as unknown as StyleCard["voice"],
    });
    expect(citationsResolve(uncited, known)[0]?.what).toContain("no citation");
  });

  test("a citation pointing at nothing fails", () => {
    // A passage id that parses and points at nothing is invariant 2 failing in
    // the one way a reader cannot detect: the mark is there and the link is
    // dead.
    expect(citationsResolve(cardWith(), new Set())[0]?.what).toContain(
      "not a stored passage",
    );
  });

  test("an exemplar citing nothing fails too", () => {
    const violations = citationsResolve(cardWith(), new Set());
    expect(violations.some((entry) => entry.where === "exemplars")).toBe(true);
  });

  test("a measured claim needs no citation", () => {
    const measured = cardWith({
      voice: {
        pov: { origin: "measured", value: "first" },
      } as unknown as StyleCard["voice"],
    });
    expect(citationsResolve(measured, known)).toEqual([]);
  });
});

describe("§9.3: an edited measure appears twice", () => {
  const measure = (overrides: Partial<FitMeasure> = {}): FitMeasure => ({
    band: [24, 32],
    bandBasis: "iqr",
    corpusValue: 28.4,
    label: "sentence length",
    path: "prosody.sentenceLength.mean",
    status: "pass",
    targetOrigin: "measured",
    targetValue: 28.4,
    value: 27,
    ...overrides,
  });

  test("a pair passes", () => {
    expect(
      editedMeasuresAppearTwice([
        measure({ targetOrigin: "edited", targetValue: 24 }),
        measure(),
      ]),
    ).toEqual([]);
  });

  test("an edited measure appearing once fails", () => {
    // A single edited verdict is a report that scored a story against a target
    // the product moved and said nothing about the corpus.
    expect(
      editedMeasuresAppearTwice([
        measure({ targetOrigin: "edited", targetValue: 24 }),
      ]),
    ).toHaveLength(1);
  });

  test("a list with no edited measures passes, which is every v1 report", () => {
    expect(editedMeasuresAppearTwice([measure()])).toEqual([]);
  });
});

describe("§7.6: every export carries the label", () => {
  test("a document with both halves of the sentence passes", () => {
    expect(
      exportCarriesLabel(
        "Generated by auteur in the style of X. AI-generated text; not written by the author.",
      ),
    ).toEqual([]);
  });

  test("a document missing it fails", () => {
    expect(exportCarriesLabel("just the prose")).toHaveLength(1);
  });

  test("half the sentence is not the sentence", () => {
    // The second half is the part that says what the reader is holding.
    expect(
      exportCarriesLabel("Generated by auteur in the style of X."),
    ).toHaveLength(1);
  });
});

describe("§4.6: nothing writes card_overlays", () => {
  test("the workspace as it stands has no writer", () => {
    expect(nothingWritesOverlays(ROOT)).toEqual([]);
  });

  test("the scan finds a write when there is one", () => {
    // A source scan rather than a runtime assertion, because the property is
    // about code that does not exist: a test that ran the pipeline and checked
    // the table would pass on the day someone added the writer and forgot to
    // run it. The negative control is gate 8's self-test case, which puts a
    // real one in the tree; this asserts the matcher itself is not vacuous.
    const pattern = /\b(insert\s+into|update|delete\s+from)\s+card_overlays\b/i;
    expect(pattern.test("INSERT INTO card_overlays (session_id)")).toBe(true);
    expect(pattern.test("UPDATE card_overlays SET fields = $1")).toBe(true);
    expect(
      pattern.test("DELETE FROM card_overlays WHERE session_id = $1"),
    ).toBe(true);
    expect(pattern.test("SELECT fields FROM card_overlays")).toBe(false);
  });
});
