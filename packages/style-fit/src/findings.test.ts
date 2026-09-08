import { describe, expect, test } from "bun:test";
import { citablePaths, forRevision, triageFindings } from "./findings.ts";
import { cardWith, corpusBlock, workProsody } from "./fixtures.ts";
import { measuresFor } from "./measures.ts";

const card = cardWith(corpusBlock());
const measures = measuresFor({ card, draft: workProsody() });

const finding = (overrides: Record<string, unknown> = {}) => ({
  path: "prosody.sentenceLength.mean",
  status: "drift",
  text: "sentences run 18.2 against 28.4 in the corpus",
  ...overrides,
});

describe("a finding without a number is dropped", () => {
  test("the product's claim is that numbers carry the argument", () => {
    // "The voice feels slightly off" is the exact failure mode this whole
    // design exists to avoid.
    const triaged = triageFindings(
      [finding({ text: "the voice feels slightly off" })],
      card,
      measures,
    );
    expect(triaged.kept).toEqual([]);
    expect(triaged.dropped[0]?.why).toContain("number");
  });

  test("one digit anywhere is enough — the schema is not a grader", () => {
    expect(triageFindings([finding()], card, measures).kept).toHaveLength(1);
  });

  test("a finding that does not parse at all is dropped with a reason", () => {
    const triaged = triageFindings([{ nonsense: true }], card, measures);
    expect(triaged.kept).toEqual([]);
    expect(triaged.dropped).toHaveLength(1);
  });
});

describe("a finding must cite a path that exists", () => {
  test("a path on neither the card nor the measures is rejected", () => {
    // It renders beside nothing, and the reader gets a claim with nothing to
    // check it against.
    const triaged = triageFindings(
      [finding({ path: "voice.invented" })],
      card,
      measures,
    );
    expect(triaged.kept).toEqual([]);
    expect(triaged.dropped[0]?.why).toContain("not a path");
  });

  test("a measure's path is citable", () => {
    expect(citablePaths(card, measures)).toContain(
      "prosody.punctuation.semicolon",
    );
  });

  test("a card field's path is citable", () => {
    expect(citablePaths(card, measures)).toContain("voice.pov");
  });

  test("a claim's internals are not citable", () => {
    // A finding citing `voice.pov.origin` is citing the provenance mechanism
    // rather than the claim, and there is nothing to render beside it.
    const paths = citablePaths(card, measures);
    expect(paths).not.toContain("voice.pov.origin");
    expect(paths).not.toContain("voice.pov.value");
  });
});

describe("what revise is given", () => {
  test("only findings that are not pass", () => {
    // A revision handed a passing finding would be asked to change prose that
    // is already in style, and the likeliest outcome is that it moves a number
    // that was fine.
    const findings = triageFindings(
      [
        finding({ status: "pass", text: "semicolons run 10.4 against 11.2" }),
        finding({ status: "drift" }),
        finding({
          path: "prosody.mattr",
          status: "fail",
          text: "0.31 vs 0.48",
        }),
      ],
      card,
      measures,
    ).kept;
    expect(forRevision(findings).map((entry) => entry.status)).toEqual([
      "drift",
      "fail",
    ]);
  });

  test("a remedy is carried through, because it is the instruction", () => {
    const findings = triageFindings(
      [finding({ remedy: "join three candidate pairs with a semicolon" })],
      card,
      measures,
    ).kept;
    expect(forRevision(findings)[0]?.remedy).toContain("semicolon");
  });

  test("nothing to revise is an empty list, not an error", () => {
    expect(forRevision([])).toEqual([]);
  });
});
