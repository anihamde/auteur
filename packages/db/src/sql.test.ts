import { describe, expect, test } from "bun:test";
import { identifier, maybeRow, oneRow, placeholders } from "./sql.ts";

describe("placeholders", () => {
  test("numbers from an offset, so a caller can append to a parameter list", () => {
    // The failure this catches: an INSERT ... SELECT that builds two clauses and
    // restarts at $1 for the second, binding the wrong values with no error.
    expect(placeholders(3)).toBe("$1, $2, $3");
    expect(placeholders(2, 4)).toBe("$4, $5");
  });

  test("a count of zero is the empty string, not '$1'", () => {
    expect(placeholders(0)).toBe("");
  });
});

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
