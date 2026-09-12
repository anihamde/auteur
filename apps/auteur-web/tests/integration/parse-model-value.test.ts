import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  parseModelText,
  parseModelValue,
} from "../../server/_stages/context.ts";

/**
 * Which of a model's two kinds of answer is parsed, and how.
 *
 * `draft` returns the story. Its schema is `z.string()` and its comment said
 * "the parse this skips is the one there is nothing to parse" — but
 * `callModel` called `JSON.parse` before applying any schema, so every draft
 * this product ever generated was thrown away with "draft did not return
 * JSON", after a minute of the strong tier. The comment described an intention
 * the code never implemented.
 */

describe("a stage that did not ask for JSON is not held to it", () => {
  test("prose satisfies a string schema", () => {
    // The defect, asserted directly: this exact text through the JSON path is
    // what produced "draft did not return JSON".
    const prose = "The lamp turned. The sea did not.";
    expect(parseModelValue(z.string().min(1), prose, "draft")).toBe(prose);
    expect(() => parseModelText(z.string().min(1), prose, "draft")).toThrow(
      /did not return JSON/,
    );
  });

  test("an empty answer is refused, so the schema is not ceremony", () => {
    // `min(1)` catches a model that returned nothing — a failure worth naming
    // rather than an empty story worth storing.
    expect(() => parseModelValue(z.string().min(1), "", "draft")).toThrow(
      /not what it declared/,
    );
  });

  test("the refusal carries the issues, like every other schema failure", () => {
    try {
      parseModelValue(z.string().min(20), "short", "draft");
      expect.unreachable();
    } catch (thrown) {
      expect(
        (thrown as { detail?: { issues?: unknown[] } }).detail?.issues,
      ).toBeDefined();
    }
  });

  test("text that happens to be JSON is still text here", () => {
    // A story beginning with a brace is not an object, and a stage that asked
    // for prose must not start parsing one.
    expect(parseModelValue(z.string(), '{"not": "a story"}', "draft")).toBe(
      '{"not": "a story"}',
    );
  });
});
