import { describe, expect, test } from "bun:test";
import { identifier, maybeRow, oneRow } from "./sql.ts";

describe("identifier", () => {
  test("refuses anything that is not a plain identifier rather than escaping it", () => {
    // Escaping invites a caller to pass user input. Refusing means the only
    // values that reach here are ones written in the source.
    for (const hostile of [
      "users; DROP TABLE sessions",
      'users" --',
      "1_leading_digit",
      "has space",
      "",
    ]) {
      expect(() => identifier(hostile)).toThrow("not a plain SQL identifier");
    }
  });

  test("quotes a plain identifier", () => {
    expect(identifier("stage_queue")).toBe('"stage_queue"');
  });
});

describe("oneRow", () => {
  test("names what was missing, so the 404 says which thing", () => {
    expect(() => oneRow([], "session 7")).toThrow("session 7 does not exist.");
  });

  test("returns the first row when there is one", () => {
    expect(oneRow([{ id: "a" }], "session")).toEqual({ id: "a" });
  });
});

describe("maybeRow", () => {
  test("an empty result is undefined, not a throw", () => {
    expect(maybeRow([])).toBeUndefined();
  });
});
