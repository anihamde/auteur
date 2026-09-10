import { describe, expect, test } from "bun:test";
import { CATALOGUE } from "../packages/provider-router/src/models.ts";
import {
  checkCatalogue,
  checkCatalogueDrift,
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

  test("an empty catalogue fails, and names the command that fills it", async () => {
    // Search answers 200 with no rows either way, so this is the only place
    // that distinguishes "nobody by that name" from "nothing was imported".
    const report = await checkCatalogue(async () => 0);
    expect(report.ok).toBe(false);
    expect(report.lines.join(" ")).toContain("bun run catalogue:import");
  });

  test("authors without works is a failure, not a pass", async () => {
    // `select-author` writes an `authors` row, so a database that has never
    // been imported into still grows one the moment somebody picks an author.
    // Counting authors alone would then report a catalogue that is not there.
    const report = await checkCatalogue(async (table) =>
      table === "authors" ? 1 : 0,
    );
    expect(report.ok).toBe(false);
  });

  test("a database with no schema is this check's finding, not a stack trace", async () => {
    // The table not existing means the schema has never come up against this
    // database. Letting the throw out would lose the other three sub-reports.
    const report = await checkCatalogue(() =>
      Promise.reject(new Error('relation "catalogue_works" does not exist')),
    );
    expect(report.ok).toBe(false);
    expect(report.lines[0]).toContain("does not exist");
  });

  test("both populated is the only thing that passes it", async () => {
    const report = await checkCatalogue(async (table) =>
      table === "authors" ? 32_329 : 86_005,
    );
    expect(report.ok).toBe(true);
    expect(report.lines[0]).toContain("32,329 authors");
  });
});

describe("the catalogue check asks the gateway", () => {
  test("a tier candidate nothing serves fails, and is named", async () => {
    // The failure this slot exists for. It used to print that the measurement
    // half of the probe was unwritten — true, and not the problem: the
    // catalogue named models the gateway had never served and nothing asked.
    const report = await checkCatalogueDrift("key", async () => []);
    expect(report.ok).toBe(false);
    expect(report.lines.join(" ")).toContain("tier candidate nothing serves");
  });

  test("agreement is the only thing that passes it", async () => {
    const report = await checkCatalogueDrift("key", async () =>
      CATALOGUE.map((row) => row.id),
    );
    expect(report.ok).toBe(true);
  });
});
