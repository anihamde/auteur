import { describe, expect, test } from "bun:test";
import {
  revisionFor,
  storedStorySchema,
} from "../../server/_stages/writing.ts";

/**
 * What one run of `story` is revising, if anything.
 *
 * The stage writes prose and rewrites it, and the difference is entirely in
 * what this function returns. Every defect below was reachable from the
 * screen with two button presses.
 */

const N1 = "9f1c0000-0000-7000-8000-000000000001";
const N2 = "9f1c0000-0000-7000-8000-000000000002";

const stored = (overrides: {
  readonly markdown?: string;
  readonly noteIds?: readonly string[];
  readonly outlineKey?: string;
}) =>
  storedStorySchema.parse({
    markdown: overrides.markdown ?? "The lamp turned.",
    noteIds: overrides.noteIds ?? [],
    outlineKey: overrides.outlineKey ?? "outline-a",
    title: "Landfall",
    wordCount: 3,
  });

describe("a first attempt", () => {
  test("no story and no notes asks for prose and nothing else", () => {
    expect(
      revisionFor({ notes: [], outlineKey: "outline-a", stored: undefined }),
    ).toEqual({});
  });

  test("a note filed before any story reaches the prompt", () => {
    // The defect: the note was hashed into the input key and dropped from the
    // prompt, because the prompt wanted a previous story alongside it. The
    // stage then looked fresh — its key already recorded — so pressing the
    // button again ran nothing, and the note only ever landed if a *second*
    // note changed the key.
    expect(
      revisionFor({
        notes: [{ id: N1, note: "start at the letter" }],
        outlineKey: "outline-a",
        stored: undefined,
      }),
    ).toEqual({ notes: ["start at the letter"] });
  });
});

describe("a rewrite sends only what has not been applied", () => {
  test("the second note goes alone, not both", () => {
    // Both would re-apply the first to a story that already has it, and "cut
    // the second scene to half" applied twice is a scene at a quarter.
    expect(
      revisionFor({
        notes: [
          { id: N1, note: "cut the second scene to half" },
          { id: N2, note: "give the ending more room" },
        ],
        outlineKey: "outline-a",
        stored: stored({ noteIds: [N1] }),
      }),
    ).toEqual({
      notes: ["give the ending more room"],
      previousStory: "The lamp turned.",
    });
  });

  test("nothing new is nothing to revise", () => {
    // Some other input moved — the preset, the card. The story is written
    // again rather than handed to a prompt that asks it to change nothing.
    expect(
      revisionFor({
        notes: [{ id: N1, note: "cut the second scene to half" }],
        outlineKey: "outline-a",
        stored: stored({ noteIds: [N1] }),
      }),
    ).toEqual({});
  });
});

describe("a beat sheet that moved is not a story to revise", () => {
  test("a different outline key drops the previous story, keeping the notes", () => {
    // Regenerating the outline on a session that has story notes: revising the
    // old prose would produce a careful edit of a story written from a beat
    // sheet nobody is going to read. The notes still travel — they are what
    // the reader asked for, and the new writing can honour them.
    expect(
      revisionFor({
        notes: [{ id: N1, note: "cut the second scene to half" }],
        outlineKey: "outline-b",
        stored: stored({ noteIds: [N1], outlineKey: "outline-a" }),
      }),
    ).toEqual({ notes: ["cut the second scene to half"] });
  });

  test("with no notes at all it is simply written again", () => {
    expect(
      revisionFor({
        notes: [],
        outlineKey: "outline-b",
        stored: stored({ outlineKey: "outline-a" }),
      }),
    ).toEqual({});
  });
});

describe("a story stored before this bookkeeping existed", () => {
  test("parses, and is treated as written from an outline that has moved", () => {
    // `noteIds` and `outlineKey` default rather than failing: a row written by
    // the previous deploy would otherwise throw on read and take the stage
    // with it.
    const old = storedStorySchema.parse({
      markdown: "The lamp turned.",
      title: "Landfall",
      wordCount: 3,
    });
    expect(old.noteIds).toEqual([]);
    expect(
      revisionFor({
        notes: [{ id: N1, note: "start at the letter" }],
        outlineKey: "outline-a",
        stored: old,
      }),
    ).toEqual({ notes: ["start at the letter"] });
  });
});
