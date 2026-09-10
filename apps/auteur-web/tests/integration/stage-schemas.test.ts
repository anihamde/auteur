import { describe, expect, test } from "bun:test";
import { EXTRACTION_JSON_SCHEMA } from "../../server/_stages/card.ts";
import { CORPUS_JSON_SCHEMA } from "../../server/_stages/research.ts";
import {
  CLARIFY_JSON_SCHEMA,
  FINDINGS_JSON_SCHEMA,
  OUTLINE_JSON_SCHEMA,
} from "../../server/_stages/writing.ts";

/**
 * Every stage's schema against the rules the gateway actually applies.
 *
 * `strict: true` is not "valid JSON Schema" — it is a narrower dialect, and a
 * request carrying a schema outside it is refused whole, before a token is
 * generated. `style-extract` carried `value: {}`, a property with no `type`,
 * and so failed on every session this product ever ran; the only thing anyone
 * could see was "The model gateway failed."
 *
 * Held here rather than at each schema because there are five of them, the
 * rules are the same five, and the next one written by hand will be the sixth.
 */

const SCHEMAS = {
  CLARIFY_JSON_SCHEMA,
  CORPUS_JSON_SCHEMA,
  EXTRACTION_JSON_SCHEMA,
  FINDINGS_JSON_SCHEMA,
  OUTLINE_JSON_SCHEMA,
} as const;

type Node = Readonly<Record<string, unknown>>;

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Every rule strict mode enforces, as a list of what this node breaks. */
const violations = (node: unknown, path: string): string[] => {
  if (!isNode(node)) return [`${path} is not a schema object`];

  const anyOf = node["anyOf"];
  if (Array.isArray(anyOf)) {
    return anyOf.flatMap((branch, index) =>
      violations(branch, `${path}.anyOf[${index.toString()}]`),
    );
  }

  const type = node["type"];
  // The one that broke the product. `{}` is a schema that validates anything,
  // which is exactly why strict mode will not take it.
  if (typeof type !== "string" && !Array.isArray(type)) {
    return [`${path} declares no type and no anyOf`];
  }

  const found: string[] = [];
  const names = Array.isArray(type) ? type : [type];

  if (names.includes("object")) {
    const properties = node["properties"];
    if (!isNode(properties)) {
      found.push(`${path} is an object with no properties`);
    } else {
      const keys = Object.keys(properties);
      const required = node["required"];
      // Strict mode has no optional property: every key must be required, and
      // "absent" is expressed as a `null` the type admits.
      if (!Array.isArray(required) || required.length !== keys.length) {
        found.push(`${path} does not require every one of its properties`);
      } else {
        for (const key of keys) {
          if (!required.includes(key)) {
            found.push(`${path}.${key} is a property that is not required`);
          }
        }
      }
      if (node["additionalProperties"] !== false) {
        found.push(`${path} does not set additionalProperties to false`);
      }
      for (const key of keys) {
        found.push(...violations(properties[key], `${path}.${key}`));
      }
    }
  }

  if (names.includes("array")) {
    const items = node["items"];
    if (items === undefined) {
      found.push(`${path} is an array with no items schema`);
    } else {
      found.push(...violations(items, `${path}[]`));
    }
  }

  return found;
};

describe("every schema a stage sends is one strict mode accepts", () => {
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    test(name, () => {
      expect(violations(schema, name)).toEqual([]);
    });
  }
});

describe("the check itself refuses what the gateway refuses", () => {
  // A checker that passes everything would have passed the schema that broke
  // the product, so each rule is asserted against a schema that breaks it.

  test("a property with no type is a violation — the actual defect", () => {
    expect(
      violations(
        {
          additionalProperties: false,
          properties: { value: {} },
          required: ["value"],
          type: "object",
        },
        "$",
      ),
    ).toEqual(["$.value declares no type and no anyOf"]);
  });

  test("a property left out of required is a violation", () => {
    expect(
      violations(
        {
          additionalProperties: false,
          properties: { a: { type: "string" }, b: { type: "string" } },
          required: ["a"],
          type: "object",
        },
        "$",
      ),
    ).toContain("$ does not require every one of its properties");
  });

  test("an open object is a violation", () => {
    expect(
      violations({ properties: {}, required: [], type: "object" }, "$"),
    ).toEqual(["$ does not set additionalProperties to false"]);
  });

  test("an array with no items is a violation", () => {
    expect(violations({ type: "array" }, "$")).toEqual([
      "$ is an array with no items schema",
    ]);
  });

  test("a union of typed branches is accepted", () => {
    expect(
      violations(
        {
          anyOf: [
            { type: "string" },
            { items: { type: "string" }, type: "array" },
          ],
        },
        "$",
      ),
    ).toEqual([]);
  });

  test("a nullable type is accepted, since that is how absence is expressed", () => {
    expect(violations({ type: ["string", "null"] }, "$")).toEqual([]);
  });
});
