import { describe, expect, test } from "bun:test";
import {
  discrimination,
  heldOut,
  type Passage,
  render,
  TARGET_CEILING,
  verdict,
} from "./discrimination.ts";

const passage = (id: string, workId: string): Passage => ({
  id,
  text: `passage ${id}`,
  workId,
});

describe("the held-out set is genuinely held out", () => {
  test("no passage from a work the card used survives the filter", () => {
    // The whole validity rests on this: a judge shown a passage the card was
    // built from is being asked whether the model recognises its own inputs.
    const all = [
      passage("a", "work-1"),
      passage("b", "work-2"),
      passage("c", "work-3"),
    ];
    const kept = heldOut(all, ["work-1", "work-3"]);
    expect(kept.map((entry) => entry.id)).toEqual(["b"]);
  });

  test("intersecting the held-out set with the card's sources is empty", () => {
    // The proof line, stated as the assertion it is.
    const all = [passage("a", "work-1"), passage("b", "work-2")];
    const used = ["work-1"];
    const kept = heldOut(all, used);
    const intersection = kept.filter((entry) => used.includes(entry.workId));
    expect(intersection).toEqual([]);
  });

  test("a card that used everything leaves nothing to judge", () => {
    const all = [passage("a", "work-1")];
    expect(heldOut(all, ["work-1"])).toEqual([]);
  });
});

describe("the rate and the verdict", () => {
  test("it is the share of pairs the judge got right", () => {
    expect(
      discrimination([
        { correct: true },
        { correct: false },
        { correct: true },
        { correct: false },
      ]),
    ).toBe(0.5);
  });

  test("no pairs is zero, not a division by zero", () => {
    expect(discrimination([])).toBe(0);
  });

  test("the target is a ceiling, so at it is met and above it is missed", () => {
    // §10: "no more than 70%". Exactly 70 is not a failure.
    expect(verdict(TARGET_CEILING)).toBe("met");
    expect(verdict(TARGET_CEILING + 0.001)).toBe("missed");
    expect(verdict(0.5)).toBe("met");
  });

  test("the report names the number and the verdict, not a smoothed word", () => {
    expect(render(0.82, 40)).toContain("82.0%");
    expect(render(0.82, 40)).toContain("missed");
  });
});
