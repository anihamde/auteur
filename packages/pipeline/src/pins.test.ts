import { describe, expect, test } from "bun:test";
import { DEFAULT_PIPELINE } from "@auteur/config/stages";
import { CATALOGUE, toDescriptor } from "@auteur/provider-router/models";
import { pinAll, requirePin, validatePin } from "./pins.ts";

const CATALOG = CATALOGUE.map((row) => toDescriptor(row));
const stages = DEFAULT_PIPELINE.stages;

/** A catalogue row that does not accept a strict schema. */
const UNTYPED = CATALOGUE.find((row) => !row.structuredOutput)?.id ?? "";
const TYPED = CATALOGUE.find((row) => row.structuredOutput)?.id ?? "";

describe("a pin is validated against exactly the check the tier map used", () => {
  test("a non-strict model on outline is refused, with the reason", () => {
    // A second copy of the rule would let a pin be accepted for a stage the
    // tier map would have refused, and the failure would arrive mid-session as
    // a schema violation rather than at the panel as a sentence.
    const verdict = validatePin({
      catalogue: CATALOG,
      pin: { modelId: UNTYPED, stageId: "outline" },
      stages,
    });
    expect(verdict.accepted).toBe(false);
    if (verdict.accepted) return;
    expect(verdict.reason).toContain("strict json_schema");
  });

  test("the same pin on draft is accepted, because draft is untyped", () => {
    expect(
      validatePin({
        catalogue: CATALOG,
        pin: { modelId: UNTYPED, stageId: "draft" },
        stages,
      }).accepted,
    ).toBe(true);
  });

  test("a strict model is accepted anywhere", () => {
    expect(
      validatePin({
        catalogue: CATALOG,
        pin: { modelId: TYPED, stageId: "outline" },
        stages,
      }).accepted,
    ).toBe(true);
  });
});

describe("what cannot be pinned", () => {
  test("an unknown stage id", () => {
    const verdict = validatePin({
      catalogue: CATALOG,
      pin: { modelId: TYPED, stageId: "no-such-stage" },
      stages,
    });
    expect(verdict.accepted).toBe(false);
    if (verdict.accepted) return;
    expect(verdict.reason).toContain("not a stage");
  });

  test("a deterministic stage, which runs no model", () => {
    const verdict = validatePin({
      catalogue: CATALOG,
      pin: { modelId: TYPED, stageId: "prosody-compute" },
      stages,
    });
    expect(verdict.accepted).toBe(false);
    if (verdict.accepted) return;
    expect(verdict.reason).toContain("nothing to pin");
  });

  test("a model the catalogue does not carry", () => {
    const verdict = validatePin({
      catalogue: CATALOG,
      pin: { modelId: "retired", stageId: "outline" },
      stages,
    });
    expect(verdict.accepted).toBe(false);
    if (verdict.accepted) return;
    expect(verdict.reason).toContain("retired");
  });
});

describe("use one model for every stage", () => {
  test("a strict model pins all seven", () => {
    // The control the design does not have, and the commoner case: someone
    // with one model they trust who wants the whole pipeline on it.
    const result = pinAll(TYPED, stages, CATALOG);
    expect(result.accepted).toHaveLength(7);
    expect(result.refused).toEqual([]);
  });

  test("a non-strict model is refused for the six typed stages, with reasons", () => {
    // Rather than silently applied to draft alone.
    const result = pinAll(UNTYPED, stages, CATALOG);
    expect(result.accepted.map((pin) => pin.stageId)).toEqual(["draft"]);
    expect(result.refused).toHaveLength(6);
    for (const refusal of result.refused) {
      expect(refusal.reason).toContain("strict json_schema");
    }
  });

  test("the deterministic stages are not in either list", () => {
    // They run no model; there is nothing to accept or refuse.
    const result = pinAll(TYPED, stages, CATALOG);
    const named = [
      ...result.accepted.map((pin) => pin.stageId),
      ...result.refused.map((refusal) => refusal.stageId),
    ];
    expect(named).not.toContain("prosody-compute");
    expect(named).not.toContain("work-fetch");
    expect(named).not.toContain("style-fit");
  });
});

describe("requirePin, for a caller that wants the pin or nothing", () => {
  test("it throws with the panel's reason in the message", () => {
    expect(() =>
      requirePin({
        catalogue: CATALOG,
        pin: { modelId: UNTYPED, stageId: "outline" },
        stages,
      }),
    ).toThrow("strict json_schema");
  });

  test("it returns the descriptor when the pin holds", () => {
    expect(
      requirePin({
        catalogue: CATALOG,
        pin: { modelId: TYPED, stageId: "outline" },
        stages,
      }).id,
    ).toBe(TYPED);
  });
});
