import { describe, expect, test } from "bun:test";
import { compare } from "./check-router-catalogue.ts";
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
