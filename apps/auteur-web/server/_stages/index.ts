import { findCard } from "@auteur/card-store/cards";
import { prosodyBlockSchema } from "@auteur/core/prosody";
import { outlineSchema, storySchema } from "@auteur/core/session";
import type { StyleCard } from "@auteur/core/style-card";
import type { Db } from "@auteur/db/db";
import { AuteurError } from "@auteur/errors/auteur-error";
import type { ModelProvider } from "@auteur/model-provider/provider";
import { fieldsSchema } from "@auteur/pipeline/extract";
import { findArtifact } from "@auteur/session-store/artifacts";
import { requireSession } from "@auteur/session-store/sessions";
import { readStageOutput } from "@auteur/session-store/stage-keys";
import { z } from "zod";
import type { StageBody } from "../_internal/stage.ts";
import { stalenessInputFor } from "../_routes/advance.ts";
import { inputKeys } from "../_staleness.ts";
import { runStyleExtract, runStyleFields } from "./card.ts";
import { contextFor } from "./context.ts";
import { runStyleFit } from "./report.ts";
import {
  corpusCandidateSchema,
  corpusSelectionSchema,
  runCorpusSelect,
  runProsodyCompute,
  runWorkFetch,
} from "./research.ts";
import { requireCard, runClarify, runOutline, runStory } from "./writing.ts";

/**
 * The dispatcher: stage id in, side effects and an output out.
 *
 * One `switch` and no registry object, deliberately. A registry keyed by stage
 * id would compile with a stage missing; the switch over a closed set does not,
 * so adding a stage to `DEFAULT_PIPELINE` and forgetting to implement it is a
 * type error rather than a run-time `undefined is not a function` three minutes
 * into a run.
 *
 * Every branch reads what it needs from the database rather than from the
 * previous stage's return value, because there is no previous stage in memory:
 * each stage is its own function invocation (§5.3). That is also what makes
 * §7.5's staleness computable — the inputs are all on disk.
 */

export type StageBodyDeps = {
  readonly provider: ModelProvider;
  /** Injected so the corpus stages can be tested against fixtures. */
  readonly fetch?: typeof globalThis.fetch;
};

/** The output of `corpus-select`, as it is stored and read back. */
const selectionOutputSchema = corpusSelectionSchema.extend({
  books: z.array(corpusCandidateSchema),
});

/** The card the session is bound to, or a stated failure. */
const cardFor = async (
  db: Parameters<typeof findCard>[0],
  sessionId: string,
): Promise<StyleCard> => {
  const session = await requireSession(db, sessionId);
  if (session.cardId === null) {
    return requireCard(undefined);
  }
  const stored = await findCard(db, session.cardId);
  return requireCard(stored?.card);
};

/** The story as it stands, or a stated failure. */
const storyFor = async (
  db: Parameters<typeof findArtifact>[0],
  sessionId: string,
) => {
  const stored = await findArtifact(db, sessionId, "draft");
  if (stored === undefined) {
    throw new AuteurError(
      "invalid_input",
      "This stage needs a draft and the session has none.",
    );
  }
  return storySchema.parse(stored.body);
};

/**
 * The measured prosody, or the failure that says why there is none.
 *
 * Both research passes read it — `style-fields` gives it to the model as
 * evidence and `style-extract` writes it onto the card — so it is read here
 * rather than twice with two different messages for the same missing row.
 */
const prosodyFor = async (db: Db, sessionId: string) => {
  const prosody = await readStageOutput(
    db,
    sessionId,
    "prosody-compute",
    (value) => prosodyBlockSchema.parse(value),
  );
  if (prosody === undefined) {
    throw new AuteurError(
      "invalid_input",
      "The corpus has not been measured yet.",
    );
  }
  return prosody;
};

export const createStageBody =
  (deps: StageBodyDeps): StageBody =>
  async ({ db, emit, sessionId, stageId }) => {
    const controller = new AbortController();
    const context = await contextFor({
      db,
      emit,
      provider: deps.provider,
      sessionId,
      signal: controller.signal,
      stageId,
    });
    // The key this stage is completing with, computed from the session as it
    // stands. `/api/internal/stage` records it; the artifact stores the same value
    // so `readFresh` and `stage_keys` can never disagree about what produced a
    // document.
    const key =
      inputKeys(await stalenessInputFor(db, sessionId)).get(stageId) ?? "";
    const fetchConfig = deps.fetch === undefined ? {} : { fetch: deps.fetch };

    switch (stageId) {
      case "corpus-select": {
        return runCorpusSelect(context);
      }
      case "work-fetch": {
        const selection = await readStageOutput(
          db,
          sessionId,
          "corpus-select",
          (value) => selectionOutputSchema.parse(value),
        );
        if (selection === undefined) {
          throw new AuteurError(
            "invalid_input",
            "No corpus has been chosen for this session.",
          );
        }
        return runWorkFetch(context, selection.books, fetchConfig);
      }
      case "prosody-compute": {
        return runProsodyCompute(context);
      }
      case "style-fields": {
        return runStyleFields(context, await prosodyFor(db, sessionId));
      }
      case "style-extract": {
        const fields = await readStageOutput(
          db,
          sessionId,
          "style-fields",
          (value) => fieldsSchema.parse(value),
        );
        if (fields === undefined) {
          throw new AuteurError(
            "invalid_input",
            "The style readings have not been taken yet.",
          );
        }
        await runStyleExtract(context, await prosodyFor(db, sessionId), fields);
        return undefined;
      }
      case "clarify": {
        return runClarify(context, await cardFor(db, sessionId));
      }
      case "outline": {
        await runOutline(context, await cardFor(db, sessionId), key);
        return undefined;
      }
      case "story": {
        const stored = await findArtifact(db, sessionId, "outline");
        if (stored === undefined) {
          throw new AuteurError(
            "invalid_input",
            "There is no outline to write from.",
          );
        }
        await runStory(
          context,
          await cardFor(db, sessionId),
          outlineSchema.parse(stored.body),
          // The beat sheet's own key, so the stage can tell "the reader wants
          // a change to this story" from "this story was written from a beat
          // sheet that no longer exists".
          stored.inputKey,
          key,
        );
        return undefined;
      }
      case "style-fit": {
        await runStyleFit(
          context,
          await cardFor(db, sessionId),
          await storyFor(db, sessionId),
          key,
        );
        return undefined;
      }
      default: {
        throw new AuteurError(
          "invalid_input",
          `${stageId} has no implementation.`,
        );
      }
    }
  };
