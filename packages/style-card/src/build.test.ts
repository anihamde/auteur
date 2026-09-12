import { describe, expect, test } from "bun:test";
import { CLAIM_PATHS } from "@auteur/core/style-card";
import type { Evidence } from "./build.ts";
import { buildCard, targetFromProsody } from "./build.ts";
import { buildInput, EVIDENCE, PROSODY } from "./fixtures.ts";

/** How many of the fixture's fields are claims coverage counts. */
const CITABLE = EVIDENCE.filter(
  (field) =>
    CLAIM_PATHS.find((claim) => claim.path === field.path)?.evidence !==
    "corpus",
).length;

const without = (path: string): Evidence[] =>
  EVIDENCE.filter((field) => field.path !== path);

/** The same list with one field's citation removed. */
const uncited = (path: string): Evidence[] =>
  EVIDENCE.map((field) =>
    field.path === path ? { path: field.path, value: field.value } : field,
  );

describe("the builder takes evidence, not a provider", () => {
  test("a card is built from a hand-written list with no stream anywhere", () => {
    // The layering consequence is that `service` does not reach up into
    // `agent`. The practical one is better: a card is testable without a
    // scripted provider and a schema round trip.
    const card = buildCard(buildInput());
    expect(card.author.id).toBe("gutenberg:borges-jorge-luis-1899");
    expect(card.voice.pov.value).toBe("first, retrospective");
    expect(card.voice.pov.origin).toBe("derived");
  });

  test("the target equals the measurement, field for field", () => {
    // §4.6: nothing edits a target, and in v1 nothing writes an overlay at
    // all. The draft prompt carries the precedence clause instead, so the
    // report keeps one basis.
    const card = buildCard(buildInput());
    expect(card.prosodyTarget).toEqual(targetFromProsody(PROSODY));
    expect(card.prosodyTarget.sentenceLength.mean).toBe(
      card.prosody.sentenceLength.mean,
    );
  });

  test("prosody is carried whole, not restated as claims", () => {
    const card = buildCard(buildInput());
    expect(card.prosody).toEqual(PROSODY);
    expect(card.measuredWords).toBe(PROSODY.words);
  });
});

describe("a claim about the corpus carries no citation and is written anyway", () => {
  test("an absence is on the card, as measured, uncited", () => {
    // No passage exhibits what an author avoids. Requiring a citation there
    // asks for a fabrication, which is the one thing invariant 2 exists to
    // prevent — and a model that answered honestly built no card at all.
    const card = buildCard(
      buildInput({
        evidence: [
          ...without("antiPatterns"),
          { path: "antiPatterns", value: ["no epigraphs"] },
        ],
      }),
    );
    expect(card.antiPatterns.value).toEqual(["no epigraphs"]);
    expect(card.antiPatterns.origin).toBe("measured");
    expect(card.antiPatterns.citation).toBeUndefined();
  });

  test("it is in neither half of the coverage ratio", () => {
    // In the denominator it would cap every card below 1.00 for doing nothing
    // wrong; in the numerator it would count evidence that does not exist.
    const card = buildCard(buildInput());
    expect(card.cardStrength.derivedFields).toBe(CITABLE);
    expect(card.confidence).toBe(1);
  });

  test("a passage claim still needs its passage", () => {
    // The rule narrowed, it did not go away: `voice.pov` is visible in any
    // passage and an uncited one is still dropped.
    expect(() =>
      buildCard(buildInput({ evidence: uncited("voice.pov") })),
    ).toThrow("not a valid card");
  });
});

describe("an uncited field is counted, not stored and not hidden", () => {
  test("an optional-in-practice field the model could not cite is left off", () => {
    // Decision 0004 works through why counting it beats storing it.
    const card = buildCard(
      buildInput({
        evidence: [
          ...EVIDENCE,
          { path: "voice.narratorDistance", value: "an uncited reading" },
        ],
      }),
    );
    // The cited version of the same path is what landed.
    expect(card.voice.narratorDistance.citation).toBeDefined();
    expect(card.voice.narratorDistance.value).not.toBe("an uncited reading");
  });

  test("confidence counts what was attempted, not what landed", () => {
    // Counting from the card alone would make every card 1.00: the uncited
    // fields are exactly the ones that did not land.
    const card = buildCard(
      buildInput({
        evidence: [
          ...EVIDENCE,
          {
            path: "voice.unsupported",
            value: "a reading with nothing behind it",
          },
          { path: "diction.unsupported", value: "another" },
        ],
      }),
    );
    expect(card.cardStrength.derivedFields).toBe(CITABLE + 2);
    expect(card.cardStrength.citedDerivedFields).toBe(CITABLE);
    expect(card.confidence).toBeCloseTo(CITABLE / (CITABLE + 2), 10);
    expect(card.confidence).toBeLessThan(1);
  });

  test("a field returned twice is attempted once", () => {
    const card = buildCard(
      buildInput({
        evidence: [...EVIDENCE, EVIDENCE[0] as Evidence],
      }),
    );
    expect(card.cardStrength.derivedFields).toBe(CITABLE);
    expect(card.confidence).toBe(1);
  });
});

describe("the card is parsed, not cast", () => {
  test("a missing required field fails here, naming it", () => {
    // Rather than in a report three stages later, where nothing knows which
    // field it was.
    expect(() =>
      buildCard(buildInput({ evidence: without("voice.pov") })),
    ).toThrow("not a valid card");
  });

  test("too few exemplars is a schema violation", () => {
    // The card promises eight to fifteen. A card with none is one the design's
    // exemplar list cannot render and the reader cannot check.
    expect(() => buildCard(buildInput({ exemplars: [] }))).toThrow(
      "not a valid card",
    );
  });

  test("the failure carries the issues, so a fix does not need a rerun", () => {
    try {
      buildCard(buildInput({ evidence: without("diction.register") }));
      throw new Error("should have thrown");
    } catch (thrown) {
      const detail = (thrown as { detail?: { issues?: unknown[] } }).detail;
      expect(Array.isArray(detail?.issues)).toBe(true);
      expect(JSON.stringify(detail?.issues)).toContain("register");
    }
  });
});

describe("cardStrength is four facts, not a blend", () => {
  test("largestWorkShare is the biggest work over the total", () => {
    // A card built from twelve works where one is 61% of the words is a card
    // describing that one work, and the number says so rather than being
    // averaged into invisibility.
    const card = buildCard(buildInput());
    expect(card.cardStrength.largestWorkShare).toBeCloseTo(
      130_000 / 214_000,
      6,
    );
    expect(card.cardStrength.workCount).toBe(2);
    expect(card.cardStrength.measuredWords).toBe(214_000);
  });
});

describe("the split is a judgement, and the card holds it", () => {
  test("every corpus claim reaches the card uncited, every passage claim cited", () => {
    // The classification is seven paths assigned by reading what each claim
    // asserts. This is what stops one drifting out of `CLAIM_PATHS` without
    // the assembler noticing — a path moved here and not there is either a
    // citation demanded for an absence, or one silently no longer required.
    const card = buildCard(buildInput()) as unknown as Record<string, unknown>;
    for (const claim of CLAIM_PATHS) {
      const value = claim.path
        .split(".")
        .reduce<unknown>(
          (cursor, part) => (cursor as Record<string, unknown>)[part],
          card,
        ) as { origin: string; citation?: unknown };
      expect(value).toBeDefined();
      if (claim.evidence === "corpus") {
        expect([claim.path, value.origin]).toEqual([claim.path, "measured"]);
        expect([claim.path, value.citation]).toEqual([claim.path, undefined]);
      } else {
        expect([claim.path, value.origin]).toEqual([claim.path, "derived"]);
        expect(value.citation).toBeDefined();
      }
    }
  });

  test("a citation offered for a corpus claim is not written", () => {
    // `origin: measured` says the reading came from the corpus and a passage
    // citation says it came from one passage. Both cannot be true, and the
    // citation is the half that is wrong — one passage cannot establish an
    // absence. The fixture offers one, which is how this stays honest.
    const card = buildCard(buildInput());
    expect(card.antiPatterns.citation).toBeUndefined();
    expect(card.antiPatterns.origin).toBe("measured");
  });

  test("both kinds exist, so neither branch is dead", () => {
    const kinds = new Set(CLAIM_PATHS.map((claim) => claim.evidence));
    expect([...kinds].sort()).toEqual(["corpus", "passage"]);
  });
});

describe("a list is a claim about recurrence", () => {
  test("every list is a corpus claim, and every line is a passage one", () => {
    // Not a coincidence: a list value is a claim about *several* things, and
    // several is a frequency. What an author's opening moves *are*, plural, is
    // a claim about what recurs, and one passage shows one opening.
    //
    // Three lists sat on the passage side and a real model returned all three
    // uncited, twice, identically — `rhythm.devices`,
    // `structure.closingMoves`, `structure.openingMoves`. It was right and the
    // classification was wrong. This is what stops the next one slipping
    // through: a claim that breaks the alignment now fails here, so it is a
    // decision somebody makes rather than a defect a deployment finds.
    for (const claim of CLAIM_PATHS) {
      expect([claim.path, claim.evidence]).toEqual([
        claim.path,
        claim.kind === "list" ? "corpus" : "passage",
      ]);
    }
  });
});
