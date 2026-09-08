import { describe, expect, test } from "bun:test";
import {
  CARRY_WORDS,
  joinScenes,
  planScenes,
  tailWords,
  withContext,
} from "./sequential.ts";

const beats = [1, 2, 3, 4].map((index) => ({
  index,
  text: `beat ${index.toString()}`,
}));

describe("the plan", () => {
  test("one draft call per beat", () => {
    expect(planScenes(beats)).toHaveLength(4);
  });

  test("a summary between beats, and none after the last", () => {
    // Nothing reads it, and a model call whose output nothing consumes is a
    // call the reader paid for.
    expect(planScenes(beats).map((plan) => plan.summarizeAfter)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  test("a critique after every beat, including the last", () => {
    // Under sequential-scene the story is long enough that a drift established
    // in beat two and caught only at the end is a revision of the whole thing.
    expect(planScenes(beats).every((plan) => plan.critiqueAfter)).toBe(true);
  });

  test("a single beat plans no summary at all", () => {
    expect(planScenes(beats.slice(0, 1))[0]?.summarizeAfter).toBe(false);
  });
});

describe("the carried tail is voice, where the summary is facts", () => {
  test("the last 500 words come across verbatim", () => {
    // A model handed only a summary starts each scene fresh and the prose
    // drifts between them in a way no measure catches, because each scene is
    // individually in style.
    const prose = Array.from(
      { length: 800 },
      (_, index) => `w${index.toString()}`,
    ).join(" ");
    const tail = tailWords(prose);
    expect(tail.split(/\s+/)).toHaveLength(CARRY_WORDS);
    expect(prose.endsWith(tail)).toBe(true);
  });

  test("a scene shorter than the window is carried whole", () => {
    expect(tailWords("three words here")).toBe("three words here");
  });

  test("the plan for beat n+1 carries beat n's tail verbatim", () => {
    const filled = withContext(planScenes(beats)[1] as never, {
      scenesSoFar: ["The lamp turned. The sea did not."],
      summary: "The keeper is called Ansel.",
    });
    expect(filled.carried).toBe("The lamp turned. The sea did not.");
    expect(filled.continuity).toBe("The keeper is called Ansel.");
  });

  test("the first beat carries nothing", () => {
    const filled = withContext(planScenes(beats)[0] as never, {
      scenesSoFar: [],
    });
    expect(filled.carried).toBeUndefined();
    expect(filled.continuity).toBeUndefined();
  });
});

describe("joining the scenes", () => {
  test("a blank line between them, which is the boundary everything splits on", () => {
    // A single newline would make the last sentence of one scene and the first
    // of the next into one paragraph, and the block splitter, the flusher and
    // the drift measurement would all be reading across a seam that is not in
    // the prose.
    expect(joinScenes(["One.", "Two."])).toBe("One.\n\nTwo.");
  });

  test("trailing whitespace in a scene does not become a third newline", () => {
    expect(joinScenes(["One.\n\n", "  Two."])).toBe("One.\n\nTwo.");
  });

  test("one scene joins to itself", () => {
    expect(joinScenes(["Only this."])).toBe("Only this.");
  });
});
