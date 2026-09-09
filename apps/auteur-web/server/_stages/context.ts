import { DEFAULT_PIPELINE } from "@auteur/config/stages";
import type { SessionEvent } from "@auteur/core/events";
import type { Stage } from "@auteur/core/pipeline";
import type { Session } from "@auteur/core/session";
import type { Db } from "@auteur/db/db";
import { AuteurError } from "@auteur/errors/auteur-error";
import type { ModelDescriptor } from "@auteur/model-provider/descriptor";
import type { ModelProvider } from "@auteur/model-provider/provider";
import type { JsonSchema } from "@auteur/model-provider/request";
import { runStage } from "@auteur/pipeline/engine";
import { findRow, toDescriptor } from "@auteur/provider-router/models";
import { readPins } from "@auteur/session-store/pins";
import { requireSession } from "@auteur/session-store/sessions";
import type { z } from "zod";
import { modelsForStages } from "../_routes/advance.ts";

/**
 * What every stage body is handed, and the one way any of them calls a model.
 *
 * The stages share this rather than each assembling a request, because the two
 * things that must not vary per stage are here: the model comes from resolution
 * or the pin and nowhere else, and the output is **parsed** before it is
 * returned. Invariant 4 is one function rather than ten remembered.
 */

export type StageContext = {
  readonly db: Db;
  readonly sessionId: string;
  readonly session: Session;
  readonly stage: Stage;
  readonly model: ModelDescriptor;
  readonly provider: ModelProvider;
  readonly signal: AbortSignal;
  readonly emit: (event: SessionEvent) => Promise<void>;
  readonly now: () => number;
};

export const stageOf = (stageId: string): Stage => {
  const stage = DEFAULT_PIPELINE.stages.find(
    (candidate) => candidate.id === stageId,
  );
  if (stage === undefined) {
    throw new AuteurError(
      "invalid_input",
      `${stageId} is not a stage in this pipeline.`,
    );
  }
  return stage;
};

/**
 * Everything a stage body needs, gathered once.
 *
 * A deterministic stage gets a context too, with no model — `model` is
 * `undefined` and the body never asks for one. Two context types would mean two
 * dispatchers.
 */
export const contextFor = async (input: {
  readonly db: Db;
  readonly sessionId: string;
  readonly stageId: string;
  readonly provider: ModelProvider;
  readonly signal: AbortSignal;
  readonly emit: (event: SessionEvent) => Promise<void>;
  readonly now?: () => number;
}): Promise<StageContext> => {
  const stage = stageOf(input.stageId);
  const [session, pins] = await Promise.all([
    requireSession(input.db, input.sessionId),
    readPins(input.db, input.sessionId),
  ]);
  const modelId = modelsForStages(pins).get(stage.id);
  const row = modelId === undefined ? undefined : findRow(modelId);
  if (stage.tier !== undefined && row === undefined) {
    throw new AuteurError(
      "model_unavailable",
      `${stage.id} has no model to run: the catalogue does not carry ${modelId ?? "any candidate"}.`,
    );
  }
  return {
    db: input.db,
    emit: input.emit,
    // A deterministic stage carries the first catalogue row and never uses it;
    // the alternative is an optional field every body has to narrow.
    model: row === undefined ? DETERMINISTIC_MODEL : toDescriptor(row),
    now: input.now ?? Date.now,
    provider: input.provider,
    session,
    sessionId: input.sessionId,
    signal: input.signal,
    stage,
  };
};

/**
 * The descriptor a deterministic stage carries.
 *
 * It runs no model, so every field here is unused — but `runStage` is not
 * called for these stages at all, and the alternative to a placeholder is an
 * optional `model` that all ten bodies would have to narrow before using.
 */
const DETERMINISTIC_MODEL: ModelDescriptor = {
  contextWindow: 0,
  creator: "none",
  displayName: "no model",
  id: "none",
  maxOutputTokens: 0,
  pricing: {
    cachedInputPerMillion: 0,
    inputPerMillion: 0,
    outputPerMillion: 0,
  },
  providerId: "none",
  structuredOutput: false,
};

/**
 * Run this stage's one model call and parse what comes back.
 *
 * The parse is here and not in the caller, so a stage body cannot accidentally
 * return the model's text. `schema` is the zod schema; `jsonSchema` is what the
 * gateway is told, and they are passed separately rather than converted from
 * one another — converting is lossy in exactly the constraints that matter, and
 * `data-boundaries` says applied schemas and sent schemas stay apart.
 */
export const callModel = async <Value>(
  context: StageContext,
  input: {
    readonly system: string;
    readonly prompt: string;
    readonly maxTokens?: number;
    readonly schema: z.ZodType<Value>;
    readonly jsonSchema?: JsonSchema;
    readonly next?: readonly string[];
  },
): Promise<Value> => {
  const outcome = await runStage({
    emit: (event) => {
      void context.emit(event);
    },
    model: context.model,
    next: input.next ?? [],
    now: context.now,
    provider: context.provider,
    request: {
      input: input.prompt,
      maxTokens: input.maxTokens ?? context.model.maxOutputTokens,
      modelId: context.model.id,
      system: input.system,
      ...(input.jsonSchema !== undefined && {
        format: {
          name: context.stage.id,
          schema: input.jsonSchema,
          strict: true as const,
        },
      }),
    },
    signal: context.signal,
    stage: context.stage,
  });

  if (outcome.status === "cancelled") {
    throw new AuteurError("cancelled", "This run was cancelled.");
  }
  if (outcome.status === "error") {
    throw outcome.error;
  }
  return parseModelText(input.schema, outcome.text, context.stage.id);
};

/**
 * A model's text, parsed.
 *
 * Two failures, named differently on purpose: text that is not JSON and JSON
 * that is not the shape. Both are `schema_violation` — the call succeeded and
 * the output was wrong, which is a prompt or schema bug and is fixed in a
 * different file from a gateway failure.
 */
export const parseModelText = <Value>(
  schema: z.ZodType<Value>,
  text: string,
  stageId: string,
): Value => {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (cause) {
    throw new AuteurError(
      "schema_violation",
      `${stageId} did not return JSON.`,
      { cause },
    );
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AuteurError(
      "schema_violation",
      `${stageId} returned JSON that is not the shape it declared.`,
      { detail: { issues: parsed.error.issues, stageId } },
    );
  }
  return parsed.data;
};
