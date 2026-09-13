import { describe, expect, test } from "bun:test";
import type { Exemplar } from "@auteur/core/style-card";
import { attachPassageText } from "../../server/_stages/writing.ts";

/**
 * The author's own prose reaching the stage that writes in their style.
 *
 * `runDraft` built its prompt straight from the card, where an exemplar is a
 * `passageId` and a sentence about what it demonstrates, and passed `text: ""`.
 * The prompt's exemplar section — "Passages from the author's own work,
 * verbatim" — was therefore a run of headings with nothing under them, on the
 * one call the whole product exists to make.
 */

const exemplar = (id: string, demonstrates: string): Exemplar => ({
  demonstrates,
  passageId: id,
  workId: "gutenberg:1",
  workTitle: "The Duel",
});

const A = "9f1c0000-0000-7000-8000-000000000001";
const B = "9f1c0000-0000-7000-8000-000000000002";

describe("an exemplar carries the passage it points at", () => {
  test("the text is the passage's, matched by id and not by order", () => {
    const attached = attachPassageText(
      [exemplar(B, "the long clause"), exemplar(A, "the flat close")],
      [
        { id: A, text: "It was a grey morning." },
        { id: B, text: "The sentence went on, and on, and turned." },
      ],
    );
    expect(attached).toEqual([
      {
        demonstrates: "the long clause",
        text: "The sentence went on, and on, and turned.",
        workTitle: "The Duel",
      },
      {
        demonstrates: "the flat close",
        text: "It was a grey morning.",
        workTitle: "The Duel",
      },
    ]);
  });

  test("an exemplar whose passage is gone is dropped, not rendered empty", () => {
    const attached = attachPassageText(
      [exemplar(A, "the flat close"), exemplar(B, "the long clause")],
      [{ id: A, text: "It was a grey morning." }],
    );
    expect(attached).toHaveLength(1);
    expect(attached[0]?.demonstrates).toBe("the flat close");
  });

  test("no exemplar is ever handed on with empty text", () => {
    // The defect itself, stated as a property: whatever the passages are, a
    // block with a heading and no body must not reach the prompt.
    const attached = attachPassageText(
      [exemplar(A, "one"), exemplar(B, "two")],
      [
        { id: A, text: "It was a grey morning." },
        { id: B, text: "" },
      ],
    );
    expect(attached.every((entry) => entry.text.length > 0)).toBe(true);
  });
});
