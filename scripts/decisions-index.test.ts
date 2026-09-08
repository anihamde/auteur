import { describe, expect, test } from "bun:test";
import { parseDecision, renderIndex } from "./decisions-index.ts";

const body = [
  "# 0007 — A decision about something",
  "",
  "**Status:** accepted · **Date:** 2026-09-08 · **Work package:** WP-Z1",
  "",
  "## Context",
].join("\n");

describe("a decision file is read strictly", () => {
  test("the heading, status and date become a row", () => {
    expect(parseDecision("0007-a-decision.md", body)).toEqual({
      date: "2026-09-08",
      file: "0007-a-decision.md",
      number: 7,
      slug: "a-decision",
      status: "accepted",
      title: "A decision about something",
    });
  });

  test("a filename and heading that disagree is an error, not a silent pick", () => {
    // The number is the identity. Two files disagreeing about theirs is how a
    // reference to "decision 7" stops resolving.
    expect(() => parseDecision("0008-a-decision.md", body)).toThrow(
      "0008 in its filename and 0007 in its heading",
    );
  });

  test("a missing status line is an error rather than a blank cell", () => {
    // The index is what a reader scans instead of opening thirty files, and a
    // blank cell makes them open the file anyway.
    expect(() =>
      parseDecision("0007-x.md", "# 0007 — A title\n\n## Context"),
    ).toThrow("Status");
  });

  test("a file not named NNNN-slug.md is an error", () => {
    expect(() => parseDecision("notes.md", body)).toThrow("NNNN-slug.md");
  });
});

describe("the index is generated, so two branches conflict in one place", () => {
  test("rows are in file order and link the file", () => {
    const rendered = renderIndex([
      {
        date: "2026-09-08",
        file: "0001-a.md",
        number: 1,
        slug: "a",
        status: "accepted",
        title: "The first",
      },
      {
        date: "2026-09-09",
        file: "0002-b.md",
        number: 2,
        slug: "b",
        status: "superseded",
        title: "The second",
      },
    ]);
    expect(rendered).toContain("| 0001 | [The first](decisions/0001-a.md)");
    expect(rendered).toContain("superseded");
    expect(rendered.indexOf("0001")).toBeLessThan(rendered.indexOf("0002"));
  });

  test("it says it is generated, in the file itself", () => {
    expect(renderIndex([])).toContain("Do not edit by hand");
  });
});
