import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import type { SessionId } from "./branded-ids.ts";
import { newId } from "./new-id.ts";
import { isUuidId, parseId } from "./parse-id.ts";

describe("newId mints a well-formed UUIDv7", () => {
  test("1000 ids all parse", () => {
    for (let index = 0; index < 1000; index += 1) {
      expect(isUuidId(newId())).toBe(true);
    }
  });

  test("version nibble is 7 and variant bits are 10", () => {
    for (let index = 0; index < 200; index += 1) {
      const id: string = newId();
      expect(id.charAt(14)).toBe("7");
      expect(["8", "9", "a", "b"]).toContain(id.charAt(19));
    }
  });

  test("1000 ids are distinct", () => {
    const ids = new Set(
      Array.from({ length: 1000 }, () => newId<SessionId>() as string),
    );
    expect(ids.size).toBe(1000);
  });
});

describe("time ordering is the reason for v7", () => {
  test("ids minted later sort later, lexicographically", async () => {
    // The property the whole choice rests on: string ordering is time ordering,
    // so rows paginate by primary key with no sort column. A v4 id would pass
    // every shape test above and fail this one.
    const first: string = newId();
    await Bun.sleep(3);
    const second: string = newId();
    await Bun.sleep(3);
    const third: string = newId();

    expect([third, first, second].sort()).toEqual([first, second, third]);
  });

  test("the leading 48 bits are the mint time in milliseconds", () => {
    const before = Date.now();
    const id: string = newId();
    const after = Date.now();
    const millis = Number.parseInt(id.slice(0, 13).replace("-", ""), 16);
    expect(millis).toBeGreaterThanOrEqual(before);
    expect(millis).toBeLessThanOrEqual(after);
  });
});

describe("parseId refuses anything that is not a UUIDv7", () => {
  test.each([
    ["a v4 uuid", "9f1c4a2e-6b3d-4e8a-9c2f-1a2b3c4d5e6f"],
    ["the nil uuid", "00000000-0000-0000-0000-000000000000"],
    ["uppercase hex", "0192F3A4-B5C6-7D8E-9F01-234567890ABC"],
    ["a bad variant", "0192f3a4-b5c6-7d8e-0f01-234567890abc"],
    ["too short", "0192f3a4-b5c6-7d8e-9f01-234567890ab"],
    ["not a string", 42],
    ["undefined", undefined],
  ])("%s throws invalid_input", (_label, value) => {
    expect(() => parseId(value, "session id")).toThrow("is not a UUIDv7");
  });

  test("a v4 uuid is refused because ordering is the guarantee", () => {
    // Shape-only validation would accept this. It has the right length, the
    // right dashes and the right alphabet, and no time ordering at all.
    expect(isUuidId("9f1c4a2e-6b3d-4e8a-9c2f-1a2b3c4d5e6f")).toBe(false);
  });

  test("a minted id round-trips", () => {
    const id = newId<SessionId>();
    expect(parseId<SessionId>(id, "session id")).toBe(id);
  });

  test("the message names what was being parsed", () => {
    expect(() => parseId("nope", "card id")).toThrow("card id");
  });
});

describe("property: anything newId produces, parseId accepts", () => {
  test("over 500 mints", () => {
    fc.assert(
      fc.property(fc.integer({ max: 3, min: 0 }), () => isUuidId(newId())),
      { numRuns: 500 },
    );
  });
});
