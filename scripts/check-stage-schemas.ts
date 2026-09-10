#!/usr/bin/env bun
/**
 * Whether the gateway accepts the schemas this product sends — **[key][net]**.
 *
 * `strict: true` is not "valid JSON Schema" but a narrower dialect, and a
 * request carrying a schema outside it is refused **whole**, before a token is
 * generated. Three stage failures in one afternoon were exactly this, and all
 * three were invisible to every test in the repository, because every test
 * sends the schema to a fake:
 *
 *  - `value: {}` — a property with no `type`. `style-extract` never succeeded.
 *  - `minItems`, silently unsupported, so the eight-exemplar floor the schema
 *    declared was never enforced and the model returned one.
 *  - `enum: [...ids, null]` beside `type: ["string", "null"]` — the gateway
 *    checks each enum member against the first declared type and refused the
 *    null the union permits.
 *
 * `stage-schemas.test.ts` holds the rules that are *known*. This asks the only
 * authority on the rest. The two are complements: one is free and runs on every
 * push, the other costs five small calls and is the reason the first has
 * anything to hold.
 *
 * **The reply is discarded.** `max_output_tokens` is the floor and the input is
 * one word: the question is whether the request is accepted, not what the model
 * says. A rejection arrives in milliseconds, before generation.
 */
import type { JsonSchema } from "../packages/model-provider/src/request.ts";

export const RESPONSES_URL = "https://api.router.com/v1/responses";

/** Enough for the gateway to answer at all, and no more. */
const MAX_OUTPUT_TOKENS = 16;

export type Fetch = (
  url: string,
  init: {
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
  },
) => Promise<Response>;

export type SchemaVerdict = {
  readonly stageId: string;
  readonly accepted: boolean;
  /** The gateway's own sentence when it refused. */
  readonly reason?: string;
};

/**
 * The gateway's word on one schema.
 *
 * A non-2xx is a refusal and its body is the finding — not translated, because
 * "Enum value None does not match declared type 'string'" is the whole
 * diagnosis and any paraphrase of it is a worse one. A transport failure is
 * also a refusal here: this check exists to be conclusive, and "could not ask"
 * is not "accepted".
 */
export const checkSchema = async (
  apiKey: string,
  modelId: string,
  stageId: string,
  schema: JsonSchema,
  config: { readonly fetch?: Fetch; readonly url?: string } = {},
): Promise<SchemaVerdict> => {
  const call = config.fetch ?? (fetch as unknown as Fetch);
  try {
    const response = await call(config.url ?? RESPONSES_URL, {
      body: JSON.stringify({
        input: "ok",
        max_output_tokens: MAX_OUTPUT_TOKENS,
        model: modelId,
        store: false,
        text: {
          format: { name: stageId, schema, strict: true, type: "json_schema" },
        },
      }),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    if (response.ok) {
      return { accepted: true, stageId };
    }
    return {
      accepted: false,
      reason: (await response.text()).slice(0, 400),
      stageId,
    };
  } catch (thrown) {
    return {
      accepted: false,
      reason: thrown instanceof Error ? thrown.message : "the request failed",
      stageId,
    };
  }
};

export const checkAll = async (
  apiKey: string,
  modelId: string,
  schemas: Readonly<Record<string, JsonSchema>>,
  config: { readonly fetch?: Fetch; readonly url?: string } = {},
): Promise<readonly SchemaVerdict[]> =>
  // Sequential, not parallel: five requests is not worth a rate limit, and a
  // 429 here would read as a schema this check cannot verify.
  await Object.entries(schemas).reduce<Promise<SchemaVerdict[]>>(
    async (soFar, [stageId, schema]) => [
      ...(await soFar),
      await checkSchema(apiKey, modelId, stageId, schema, config),
    ],
    Promise.resolve([]),
  );
