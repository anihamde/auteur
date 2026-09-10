import { describe, expect, test } from "bun:test";
import { CLAIM_PATHS } from "@auteur/core/style-card";
import {
  exemplarsJsonSchema,
  fieldsJsonSchema,
} from "../../server/_stages/card.ts";
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

/** The ids a request would carry; the extraction schema enumerates them. */
const PASSAGE_IDS = [
  "01a08c1f-0000-7000-8000-000000000001",
  "01a08c1f-0000-7000-8000-000000000002",
];

const SCHEMAS = {
  CLARIFY_JSON_SCHEMA,
  CORPUS_JSON_SCHEMA,
  EXEMPLARS_JSON_SCHEMA: exemplarsJsonSchema(PASSAGE_IDS),
  FIELDS_JSON_SCHEMA: fieldsJsonSchema(PASSAGE_IDS),
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

describe("the extraction schema refuses what the assembler would discard", () => {
  const schema = fieldsJsonSchema(PASSAGE_IDS) as Record<string, Node>;
  const fields = (schema["properties"] as Record<string, Node>)[
    "fields"
  ] as Node;
  const field = fields["items"] as Record<string, Node>;
  const properties = field["properties"] as Record<string, Node>;

  test("every claim path the card requires is offered, and only those", () => {
    // A path the assembler does not recognise is a field silently dropped and
    // a card that then fails to build for a missing claim — two failures away
    // from the typo that caused it.
    expect(properties["path"]?.["enum"]).toEqual(
      CLAIM_PATHS.map((claim) => claim.path),
    );
  });

  test("a citation is one of the offered ids or null, and nothing else", () => {
    // The model returned an invented uuid when the schema allowed any string.
    // An enum is the difference between the gateway refusing it and this code
    // dropping it after a 49-second call.
    //
    // Two branches, not one nullable enum: the gateway checks each enum member
    // against the first declared type, and answered
    // "Enum value None does not match declared type 'string'" to the whole
    // request.
    expect(properties["citationPassageId"]?.["anyOf"]).toEqual([
      { enum: PASSAGE_IDS, type: "string" },
      { type: "null" },
    ]);
  });

  test("no enumeration anywhere mixes null in among strings", () => {
    // The rule the gateway taught, held over the whole schema rather than the
    // one property that broke: a nullable enumeration is two branches.
    const nullInEnum = (node: unknown, path: string): string[] => {
      if (!isNode(node)) return [];
      const found: string[] = [];
      const values = node["enum"];
      if (Array.isArray(values) && values.includes(null)) {
        found.push(`${path} puts null in an enum`);
      }
      for (const [key, child] of Object.entries(node)) {
        if (Array.isArray(child)) {
          found.push(
            ...child.flatMap((entry, index) =>
              nullInEnum(entry, `${path}.${key}[${index.toString()}]`),
            ),
          );
        } else {
          found.push(...nullInEnum(child, `${path}.${key}`));
        }
      }
      return found;
    };
    expect(nullInEnum(fieldsJsonSchema(PASSAGE_IDS), "$")).toEqual([]);
    expect(nullInEnum(exemplarsJsonSchema(PASSAGE_IDS), "$")).toEqual([]);
  });

  test("an exemplar's passage id is one that was offered", () => {
    const exemplars = (
      (exemplarsJsonSchema(PASSAGE_IDS) as Record<string, Node>)[
        "properties"
      ] as Record<string, Node>
    )["exemplars"] as Node;
    const item = exemplars["items"] as Record<string, Node>;
    const props = item["properties"] as Record<string, Node>;
    expect(props["passageId"]?.["enum"]).toEqual(PASSAGE_IDS);
  });
});
