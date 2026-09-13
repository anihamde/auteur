import { describe, expect, test } from "bun:test";
import { fileNameFor, type Saver, saveText } from "./download.ts";

/**
 * Handing the finished story over.
 *
 * The story's title is model output and this is where it reaches a filesystem,
 * so the filename rules are the ones invariant 4 asks for in the direction
 * people forget. The saver is injected, which is what lets the revoke be
 * asserted at all: an object URL that outlives its click holds the whole
 * document for the life of the tab, and nothing about the download looks wrong
 * when it does.
 */

const recordingSaver = () => {
  const created: string[] = [];
  const revoked: string[] = [];
  const clicked: { download: string; href: string }[] = [];
  const scheduled: (() => void)[] = [];
  const saver: Saver = {
    anchor: () => {
      const anchor = {
        click: () => {
          clicked.push({ download: anchor.download, href: anchor.href });
        },
        download: "",
        href: "",
      };
      return anchor;
    },
    createObjectUrl: () => {
      const url = `blob:${created.length.toString()}`;
      created.push(url);
      return url;
    },
    later: (task) => {
      scheduled.push(task);
    },
    revokeObjectUrl: (url) => {
      revoked.push(url);
    },
  };
  return { clicked, created, revoked, saver, scheduled };
};

describe("a title becomes a filename that is only a filename", () => {
  test("spaces and punctuation collapse to hyphens", () => {
    expect(fileNameFor("The Lamp, Turning", "md")).toBe("the-lamp-turning.md");
  });

  test("a title that is a path does not stay one", () => {
    // The one that matters: a model returning `../../etc/passwd` as a title
    // must not produce a filename with a separator in it, and a leading dot
    // must not survive either.
    const name = fileNameFor("../../etc/passwd", "md");
    expect(name).toBe("etc-passwd.md");
    expect(name).not.toContain("/");
    expect(name.startsWith(".")).toBe(false);
  });

  test("a title of nothing but punctuation falls back rather than empties", () => {
    expect(fileNameFor("!!! ---", "md")).toBe("story.md");
    expect(fileNameFor(null, "md")).toBe("story.md");
    expect(fileNameFor(undefined, "md")).toBe("story.md");
  });

  test("a long title is cut and does not end on the cut's hyphen", () => {
    const name = fileNameFor("a ".repeat(80), "md");
    expect(name.endsWith("-.md")).toBe(false);
    expect(name.length).toBeLessThanOrEqual(64);
  });
});

describe("saving hands over the bytes and keeps nothing", () => {
  test("the anchor carries the name and the url, and nothing is revoked yet", () => {
    // The defect this holds shut: `anchor.click()` *queues* the fetch of the
    // blob. Firefox reads the URL when that fetch runs, so revoking in the same
    // tick removes the entry first — the export succeeds, nothing throws, no
    // alert renders, and no file is written.
    const { clicked, created, revoked, saver, scheduled } = recordingSaver();
    saveText(
      {
        fileName: "landfall.md",
        mediaType: "text/markdown",
        text: "# Landfall",
      },
      saver,
    );
    expect(clicked).toEqual([
      { download: "landfall.md", href: created[0] ?? "" },
    ]);
    expect(revoked).toEqual([]);

    for (const task of scheduled) task();
    expect(revoked).toEqual(created);
  });

  test("a click that throws still revokes", () => {
    // The revoke is scheduled before the click, which is what makes the leak
    // impossible without a `try`: a click that throws has already handed the
    // URL to something that will free it. Without that, a failing click leaks
    // the whole document for the life of the tab and nothing looks wrong.
    const { created, revoked, saver, scheduled } = recordingSaver();
    const throwing: Saver = {
      ...saver,
      anchor: () => ({
        click: () => {
          throw new Error("the click failed");
        },
        download: "",
        href: "",
      }),
    };
    expect(() => {
      saveText(
        { fileName: "landfall.md", mediaType: "text/markdown", text: "x" },
        throwing,
      );
    }).toThrow("the click failed");
    for (const task of scheduled) task();
    expect(revoked).toEqual(created);
    expect(revoked).toHaveLength(1);
  });
});
