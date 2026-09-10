import { describe, expect, test } from "bun:test";
import { TIER_CANDIDATES } from "../packages/config/src/tiers.ts";
import {
  parseGatewayModels,
  served,
} from "../packages/provider-router/src/gateway-models.ts";
import { CATALOGUE } from "../packages/provider-router/src/models.ts";
import reduced from "../packages/provider-router/tests/fixtures/gateway-models.reduced.json" with {
  type: "json",
};
import { compare, unservedCandidates } from "./check-router-catalogue.ts";
import {
  isDrift,
  type ProbeRow,
  renderReport,
} from "./probe-router-responses.ts";

describe("what the models route can actually tell us", () => {
  test("a catalogue row the gateway no longer serves is a pin waiting to fail", () => {
    expect(compare(["gpt-5", "retired"], ["gpt-5"])).toEqual({
      absentFromCatalogue: [],
      missingFromGateway: ["retired"],
    });
  });

  test("a model the gateway serves that the catalogue has not heard of", () => {
    expect(compare(["gpt-5"], ["gpt-5", "new-thing"])).toEqual({
      absentFromCatalogue: ["new-thing"],
      missingFromGateway: [],
    });
  });

  test("agreement is two empty lists, not a boolean", () => {
    expect(compare(["gpt-5"], ["gpt-5"])).toEqual({
      absentFromCatalogue: [],
      missingFromGateway: [],
    });
  });
});

const row = (overrides: Partial<ProbeRow> = {}): ProbeRow => ({
  declaredMaxOutputTokens: 32_000,
  declaredStructuredOutput: true,
  id: "gpt-5",
  measuredMaxOutputTokens: 32_000,
  measuredStructuredOutput: true,
  ...overrides,
});

describe("the probe fails on a discrepancy rather than absorbing it", () => {
  test("a structuredOutput that measured false against a declared true is drift", () => {
    // The direction that matters: six of seven model stages are typed, so a
    // declared-true that is really false fails a stage mid-session.
    expect(isDrift(row({ measuredStructuredOutput: false }))).toBe(true);
  });

  test("a ceiling that measured lower than declared is drift", () => {
    // A declared ceiling above the real one selects a single-call draft that
    // truncates, and a truncated story reports as complete.
    expect(isDrift(row({ measuredMaxOutputTokens: 16_000 }))).toBe(true);
  });

  test("a row the probe could not reach is not drift, and not agreement either", () => {
    // Absent measurement must not be recorded as agreement: that is exactly
    // how a table gets marked verified without being measured.
    expect(
      isDrift(
        row({
          measuredMaxOutputTokens: "unreachable",
          measuredStructuredOutput: "unreachable",
        }),
      ),
    ).toBe(false);
  });

  test("the report names every drifted row rather than only counting them", () => {
    const report = renderReport([
      row(),
      row({ id: "kimi-k3", measuredStructuredOutput: false }),
    ]);
    expect(report).toContain("1 row(s) drifted: kimi-k3");
    expect(report).toContain("true → false");
  });

  test("no drift says so explicitly", () => {
    expect(renderReport([row()])).toContain("no drift");
  });
});

describe("the two sides of the comparison apply the same rule", () => {
  const models = parseGatewayModels(reduced);
  const servedIds = served(models).map((model) => model.id);
  const deprecated = models
    .filter((model) => model.router.status === "deprecated")
    .map((model) => model.id);

  test("the catalogue as generated drifts from the gateway by nothing", () => {
    // It compared the catalogue against every id the gateway lists, while the
    // catalogue drops deprecated models on purpose — so it reported seven of
    // them missing on the day the catalogue was generated, and its own remedy
    // ("re-run the generator") drops them again. It could never pass.
    expect(deprecated.length).toBeGreaterThan(0);
    expect(
      compare(
        CATALOGUE.map((row) => row.id),
        servedIds,
      ),
    ).toEqual({ absentFromCatalogue: [], missingFromGateway: [] });
  });

  test("a candidate the gateway has deprecated is unserved, not ok", () => {
    // `resolveTier` walks the catalogue, which has dropped it. Reporting it as
    // served is the check saying "ok every tier candidate is a model that
    // exists" about one no stage can ever resolve to.
    const candidate = TIER_CANDIDATES.balanced[0] ?? "";
    expect(candidate).not.toBe("");
    const withoutIt = servedIds.filter((id) => id !== candidate);

    expect(unservedCandidates(servedIds)).toEqual([]);
    expect(unservedCandidates(withoutIt)).toEqual([candidate]);
  });
});
