import { describe, expect, test } from "bun:test";
import type { Evidence } from "./build.ts";
import { buildCard, targetFromProsody } from "./build.ts";
import { buildInput, EVIDENCE, PROSODY } from "./fixtures.ts";

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

describe("an uncited field is counted, not stored and not hidden", () => {
  test("an optional-in-practice field the model could not cite is left off", () => {
    // Invariant 2 is absolute: claimSchema refuses a derived claim with no
    // citation, so there is no shape the assembler could produce that carries
    // one. Decision 0004 works through why counting it beats storing it.
    const card = buildCard(
      buildInput({
        evidence: [
          ...EVIDENCE,
          { path: "imagery.motifs", value: ["an uncited reading"] },
        ],
      }),
    );
    // The cited version of the same path is what landed.
    expect(card.imagery.motifs.value).toEqual(["mirrors"]);
    expect(card.imagery.motifs.citation).toBeDefined();
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
    expect(card.cardStrength.derivedFields).toBe(EVIDENCE.length + 2);
    expect(card.cardStrength.citedDerivedFields).toBe(EVIDENCE.length);
    expect(card.confidence).toBeCloseTo(
      EVIDENCE.length / (EVIDENCE.length + 2),
      10,
    );
    expect(card.confidence).toBeLessThan(1);
  });

  test("a field returned twice is attempted once", () => {
    const card = buildCard(
      buildInput({
        evidence: [...EVIDENCE, EVIDENCE[0] as Evidence],
      }),
    );
    expect(card.cardStrength.derivedFields).toBe(EVIDENCE.length);
    expect(card.confidence).toBe(1);
  });

  test("a required field the model could not cite does not build a card", () => {
    // The correct failure for a card that cannot keep its own promise. The
    // pipeline reports it; it does not ship a card with a hole.
    expect(() =>
      buildCard(buildInput({ evidence: uncited("voice.pov") })),
    ).toThrow("not a valid card");
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
