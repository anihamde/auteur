import { describe, expect, test } from "bun:test";
import {
  checkGutendex,
  exitCodeFor,
  missing,
  render,
  type SubReport,
  unchecked,
} from "./verify-live.ts";

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

describe("a check that did not run does not report ok", () => {
  test("an unwritten check fails, and names what would run it", () => {
    // Three of these four reported `ok: true` with a note naming the script
    // that would have checked them. A green run then meant "nothing ran",
    // which is the one thing this pass exists to make impossible.
    const report = unchecked("a thing", "Nobody wrote it.", "bun probe.ts");
    expect(report.ok).toBe(false);
    expect(report.lines.join(" ")).toContain("bun probe.ts");
    expect(exitCodeFor([report])).toBe(1);
  });

  test("the gutendex check reports the parse failure, not a command", async () => {
    const report = await checkGutendex(async () => ({
      ok: false,
      problem: "results.0.authors: Required",
    }));
    expect(report.ok).toBe(false);
    expect(report.lines[0]).toBe("results.0.authors: Required");
  });

  test("a live response that parses is the only thing that passes it", async () => {
    const report = await checkGutendex(async () => ({ books: 32, ok: true }));
    expect(report.ok).toBe(true);
    expect(report.lines[0]).toContain("32 books");
  });
});
