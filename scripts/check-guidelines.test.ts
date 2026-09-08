import { describe, expect, test } from "bun:test";
import { indexedIds, readFrontMatter, tierOf } from "./check-guidelines.ts";
import { NOT_TAKEN } from "./guidelines-not-taken.ts";

const index = [
  "## ALWAYS — load in full before any work",
  "| [Testing](docs/guidelines/testing.md) | TDD |",
  "## IF TOUCHED — load when your change touches the topic",
  "| [Icons](docs/guidelines/icons.md) | You import an icon. |",
  "## REFERENCE — look up as needed",
  "| [CI](docs/guidelines/ci.md) | Keeping CI fast |",
].join("\n");

describe("the index is read by its structure, not by trust", () => {
  test("every linked id is found", () => {
    expect(indexedIds(index)).toEqual(["testing", "icons", "ci"]);
  });

  test("an id's tier is the section it sits in", () => {
    // What makes the addendum check possible: promotion is the only direction,
    // so a promotion of an already-ALWAYS document has to be detectable.
    expect(tierOf(index, "testing")).toBe("always");
    expect(tierOf(index, "icons")).toBe("if-touched");
    expect(tierOf(index, "ci")).toBe("reference");
  });

  test("an id the index does not link has no tier", () => {
    expect(tierOf(index, "nextjs")).toBeUndefined();
  });
});

describe("front matter", () => {
  const front = [
    "---",
    "id: icons-lucide",
    "title: Icons — Lucide",
    "tier: if-touched",
    'trigger: "You import or add an icon."',
    "overrides: [icons]",
    "---",
    "",
    "# Icons",
  ].join("\n");

  test("reads the four keys the gate branches on", () => {
    expect(readFrontMatter(front)).toEqual({
      id: "icons-lucide",
      overrides: ["icons"],
      tier: "if-touched",
      trigger: "You import or add an icon.",
    });
  });

  test("quotes are stripped, so a trigger reads the same either way", () => {
    expect(readFrontMatter(front).trigger).not.toContain('"');
  });

  test("a document with no front matter yields nothing, rather than throwing", () => {
    // The gate reports it as a problem naming the file; throwing here would
    // report it as a crash naming this parser.
    expect(readFrontMatter("# Just a heading")).toEqual({});
  });

  test('an empty overrides list is an empty array, not [""]', () => {
    expect(readFrontMatter("---\nid: x\noverrides: []\n---").overrides).toEqual(
      [],
    );
  });
});

describe("what auteur deliberately does not take", () => {
  test("each exclusion carries a reason, not just an id", () => {
    // The reason is what a reader checks when they wonder whether the
    // exclusion still holds. Two of these would stop holding if auteur grew
    // accounts or a native component.
    for (const [id, reason] of Object.entries(NOT_TAKEN)) {
      expect([id, reason.length > 60]).toEqual([id, true]);
    }
  });

  test("the three are nextjs, auth and rust", () => {
    expect(Object.keys(NOT_TAKEN).sort()).toEqual(["auth", "nextjs", "rust"]);
  });
});
