import { describe, expect, test } from "bun:test";
import { STAGE_IDS } from "@auteur/config/stages";
import { STEPS } from "@auteur/core/session";
import {
  descendantsOf,
  LAST_STAGE_FOR_STEP,
  successorsOf,
  successorsWithin,
} from "../../server/_graph.ts";

/**
 * What a finished stage is allowed to start.
 *
 * The defect this holds shut, from a real run: `clarify` wrote its questions
 * and `outline` started 0.4 seconds later, before the reader had seen a
 * question let alone answered one. `outline` reads the answer set, found it
 * empty, and built the beat sheet from the idea alone — so the whole clarify
 * step was theatre, and nothing downstream ever read a word the reader typed.
 */

describe("a finished stage never runs past the step the session is on", () => {
  test("the last research stage does not start the questions", () => {
    expect(successorsOf("style-extract")).toContain("clarify");
    expect(successorsWithin("style-extract", "research")).toEqual([]);
  });

  test("clarify does not start the outline", () => {
    expect(successorsOf("clarify")).toContain("outline");
    expect(successorsWithin("clarify", "clarify")).toEqual([]);
  });

  test("the outline does not start the story", () => {
    expect(successorsWithin("outline", "outline")).toEqual([]);
  });

  test("a step that needs no stage starts nothing at all", () => {
    expect(successorsWithin("corpus-select", "idea")).toEqual([]);
    expect(successorsWithin("corpus-select", "author")).toEqual([]);
  });
});

describe("the chain inside a step still runs without the reader", () => {
  test("fetching leads to prosody and the readings within research", () => {
    expect(successorsWithin("work-fetch", "research")).toEqual([
      "prosody-compute",
      "style-fields",
      "style-extract",
    ]);
  });

  test("the outline starts once the reader has asked for it", () => {
    expect(successorsWithin("clarify", "outline")).toEqual(["outline"]);
  });

  test("the result step runs the whole tail", () => {
    expect(successorsWithin("outline", "result")).toEqual(["story"]);
    expect(successorsWithin("story", "result")).toEqual(["style-fit"]);
  });
});

describe("the bound is the same one advance uses", () => {
  test("every step's last stage is a stage the pipeline has", () => {
    // A step whose bound named no stage would silently gate everything: the
    // index lookup returns -1 and no successor is ever at or before it.
    for (const step of STEPS) {
      const limit = LAST_STAGE_FOR_STEP[step];
      if (limit === undefined) continue;
      expect(STAGE_IDS).toContain(limit);
    }
  });
});

describe("a regenerate replaces everything built on what it replaces", () => {
  test("the outline's descendants are the whole tail, transitively", () => {
    // Two hops matter: `style-fit` reads `story`, which reads the outline. A
    // one-hop answer would leave the report scoring a story that no longer
    // exists.
    expect(descendantsOf("outline")).toEqual(["story", "style-fit"]);
  });

  test("the last stage has none, which is how a regenerate of it ends", () => {
    expect(descendantsOf("style-fit")).toEqual([]);
  });

  test("a stage is not its own descendant", () => {
    // `reads` has no cycles, and the walk must not invent one: a stage that
    // enqueued itself as its own descendant would run twice per regenerate.
    for (const id of STAGE_IDS) {
      expect(descendantsOf(id)).not.toContain(id);
    }
  });

  test("descendants come back in graph order, not discovery order", () => {
    // They are enqueued in this order and the worker takes the oldest row, so
    // discovery order would run `revise` before the draft it revises.
    const tail = descendantsOf("clarify");
    const positions = tail.map((id) => STAGE_IDS.indexOf(id));
    expect(positions).toEqual(positions.toSorted((a, b) => a - b));
  });
});
