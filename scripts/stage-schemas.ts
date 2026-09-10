#!/usr/bin/env bun
/**
 * Every schema a stage sends, in one place a check can reach.
 *
 * The bodies live under `apps/auteur-web/server/_stages/`, one per group of
 * stages, because that is where the prompt and the parse live too. A check that
 * asks the gateway whether it accepts them needs all five, and enumerating them
 * at the call site is how the sixth gets forgotten.
 *
 * `extractionJsonSchema` is built per request — `path` and `passageId` are
 * enumerations of that request's own data — so it is called here with sample
 * ids. The gateway validates the shape, not the values.
 */
import { extractionJsonSchema } from "../apps/auteur-web/server/_stages/card.ts";
import { CORPUS_JSON_SCHEMA } from "../apps/auteur-web/server/_stages/research.ts";
import {
  CLARIFY_JSON_SCHEMA,
  FINDINGS_JSON_SCHEMA,
  OUTLINE_JSON_SCHEMA,
} from "../apps/auteur-web/server/_stages/writing.ts";
import type { JsonSchema } from "../packages/model-provider/src/request.ts";

const SAMPLE_PASSAGE_IDS = [
  "01a08c1f-0000-7000-8000-000000000001",
  "01a08c1f-0000-7000-8000-000000000002",
];

/** Keyed by the stage the gateway is told the schema belongs to. */
export const STAGE_SCHEMAS: Readonly<Record<string, JsonSchema>> = {
  clarify: CLARIFY_JSON_SCHEMA,
  "corpus-select": CORPUS_JSON_SCHEMA,
  critique: FINDINGS_JSON_SCHEMA,
  outline: OUTLINE_JSON_SCHEMA,
  "style-extract": extractionJsonSchema(SAMPLE_PASSAGE_IDS),
};
