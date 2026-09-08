import { describe, expect, test } from "bun:test";
import { exitCodeFor, missing, render, type SubReport } from "./verify-live.ts";

const ok = (name: string): SubReport => ({ lines: [], name, ok: true });

describe("the pass fails on any discrepancy rather than absorbing it", () => {
  test("one failing sub-report fails the run", () => {
    // A green run is the claim that every declared value was right. A pass
    // that absorbed one finding would report success for having changed the
    // answer.
    expect(exitCodeFor([ok("a"), ok("b")])).toBe(0);
    expect(exitCodeFor([ok("a"), missing("b", "SOME_KEY")])).toBe(1);
  });

  test("a check that could not run is a failure, not a skip", () => {
    // Not checking is not the same as passing.
    const report = missing("the catalogue", "RAMP_ROUTER_API_KEY");
    expect(report.ok).toBe(false);
    expect(report.lines.join(" ")).toContain("RAMP_ROUTER_API_KEY is unset");
  });

  test("each sub-report is separately green or names what moved", () => {
    const output = render([ok("first"), missing("second", "KEY")]);
    expect(output).toContain("ok   first");
    expect(output).toContain("FAIL second");
    expect(output).toContain("1 of 2 checks found something");
  });

  test("a wholly green run says what it is claiming", () => {
    expect(render([ok("a"), ok("b")])).toContain(
      "Every declared value was right",
    );
  });
});
