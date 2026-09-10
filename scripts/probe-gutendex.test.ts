import { describe, expect, test } from "bun:test";
import fixture from "../packages/corpus-gutenberg/tests/fixtures/gutendex-search.synthetic.json" with {
  type: "json",
};
import { checkPayload } from "./probe-gutendex.ts";

describe("the probe reports what moved rather than whether it worked", () => {
  test("a payload the schema accepts reports how many books it saw", () => {
    expect(checkPayload(fixture)).toEqual({ books: 3, ok: true });
  });

  test("a field this code does not read is not a failure", () => {
    // Gutendex added `editors`, and `.strict()` turned an upstream addition
    // into every search failing on the deployment: the response was otherwise
    // exactly right. Another service's roadmap is not this product's outage.
    const payload = JSON.parse(JSON.stringify(fixture)) as {
      results: Record<string, unknown>[];
    };
    for (const book of payload.results) {
      book["editors"] = [];
      book["a_field_invented_next_year"] = { anything: true };
    }

    expect(checkPayload(payload).ok).toBe(true);
  });

  test("a payload the schema rejects carries the field names in its problem", () => {
    // The message is what whoever runs this against the live API reads, so it
    // has to name the field rather than say the parse failed.
    const payload = JSON.parse(JSON.stringify(fixture)) as {
      results: Record<string, unknown>[];
    };
    const first = payload.results[0];
    if (first === undefined) throw new Error("fixture");
    first["book_title"] = first["title"];
    delete first["title"];

    const result = checkPayload(payload);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The field that went missing, at the row it went missing from. A rename
    // is an absence, so this catches it without the schema having to know what
    // the new name is.
    expect(result.problem).toContain("title");
    expect(result.problem).toContain("results[0]");
  });

  test("a payload that is not an object at all is a problem, not a throw", () => {
    expect(checkPayload("not json").ok).toBe(false);
  });
});
