import { putCard } from "@auteur/card-store/cards";
import type { ProsodyBlock } from "@auteur/core/prosody";
import { CLAIM_PATHS, type StyleCard } from "@auteur/core/style-card";
import { findAuthor } from "@auteur/corpus-store/authors";
import {
  listPassagesForWork,
  type StoredPassage,
} from "@auteur/corpus-store/passages";
import { listWorksByAuthor } from "@auteur/corpus-store/works";
import { AuteurError } from "@auteur/errors/auteur-error";
import { newId } from "@auteur/ids/new-id";
import type { JsonSchema } from "@auteur/model-provider/request";
import {
  cardFromExtraction,
  type ExtractedFields,
  exemplarsSchema,
  fieldsSchema,
} from "@auteur/pipeline/extract";
import { styleExtract } from "@auteur/prompt/style-extract";
import { styleFields } from "@auteur/prompt/style-fields";
import { PROMPT_VERSIONS } from "@auteur/prompt/versions";
import { prosodyVersion } from "@auteur/prosody/version";
import { updateSession } from "@auteur/session-store/sessions";
import { buildKey } from "@auteur/style-card/build-key";
import { cleanerVersion, segmenterVersion } from "@auteur/text/version";
import { callModel, type StageContext } from "./context.ts";

/**
 * `style-extract` — the card, and the cache that makes it worth building.
 *
 * §4.4: the same author, works, toolchain, prompt and model produce the same
 * card, and `build_key` is what says so. The key is computed **before** the
 * model call, so a cache hit costs nothing — which is the whole point of a card
 * that takes forty passages and a large model to build.
 */

/**
 * How many passages the extraction reads (§4.3).
 *
 * Twenty, of the roughly forty the segmenter produces. It was forty, and the
 * call then needed more than the sixty seconds an invocation gets: about
 * fifty against nine short passages in `verify:live`, and a timeout on the
 * deployment against forty long ones. Halving the input halves the prefill,
 * and the segmenter still stores the full spread, so nothing about the corpus
 * is lost — only how much of it one model call reads.
 *
 * It is a real trade: a card read from half the evidence is a card with less
 * behind it. `cardStrength.measuredWords` and `workCount` still report the
 * whole corpus, because prosody is computed from the full texts and only this
 * qualitative half is sampled.
 */
export const EXTRACT_PASSAGES = 20;

/**
 * Take a spread across the works, not a prefix of them.
 *
 * The lists arrive one per work and were concatenated and sliced, which was
 * harmless while the budget exceeded the total and is a defect the moment it
 * does not: a prefix of a concatenation is the earliest works entire and the
 * later ones not at all. `corpus-select` spends its whole instruction sampling
 * across a career, and a prefix here would throw that away one stage later.
 *
 * Round-robin, so the first passage of every work is taken before the second
 * of any, and a work with fewer passages simply drops out of later rounds.
 */
export const spreadAcross = <Item>(
  byWork: readonly (readonly Item[])[],
  limit: number,
): Item[] => {
  const chosen: Item[] = [];
  // Before the loop, because the check inside it runs *after* a push: a limit
  // of zero would otherwise take everything, which is the opposite of nothing.
  if (limit <= 0) return chosen;
  const deepest = Math.max(0, ...byWork.map((work) => work.length));
  for (let round = 0; round < deepest; round += 1) {
    for (const work of byWork) {
      const item = work[round];
      if (item === undefined) continue;
      chosen.push(item);
      if (chosen.length >= limit) return chosen;
    }
  }
  return chosen;
};

/**
 * The extraction's shape, as the gateway's strict `json_schema` mode requires
 * it — which is not the same thing as valid JSON Schema.
 *
 * Strict mode refuses a property with no `type`, and `value` had none: it is a
 * zod union of a string and a string array, and an empty `{}` is what that
 * looks like when nobody writes the union out. The whole request was rejected,
 * so `style-extract` failed for every session ever run.
 *
 * `citationPassageId` is nullable for the neighbouring reason. Strict mode
 * requires **every** property in `required`, so there is no way to express "may
 * be absent" but there is a way to express "may be null" — and before this the
 * model had to send the key with no citation to give, which meant an empty
 * string, which is not a uuid, which failed the zod parse of the whole
 * extraction. It is written as two `anyOf` branches rather than a nullable
 * enum, because the gateway checks each enum member against the first declared
 * type and refuses a `null` among strings.
 *
 * **Built per request, because two of its fields are enumerations of this
 * request's own data.** `path` is one of the card's twenty-two claim paths and
 * `passageId` is one of the ids actually offered, so a path the assembler would
 * discard and a passage id nobody offered are both refused by the gateway
 * rather than parsed and dropped here. The model returned an invented
 * `passageId` when the schema let it; with an enum it cannot.
 *
 * What the schema still cannot say is **how many**: strict mode does not
 * support `minItems` or `maxItems`, so the eight-to-fifteen exemplar range and
 * "one field per path" live in the prompt and in zod. That is the reason the
 * prompt now states them — a constraint enforced only after the fact is one the
 * model was never told.
 *
 * `stage-schemas.test.ts` holds strict mode's rules against every stage.
 */
export const fieldsJsonSchema = (
  passageIds: readonly string[],
): JsonSchema => ({
  additionalProperties: false,
  properties: {
    fields: {
      items: {
        additionalProperties: false,
        properties: {
          // Two branches rather than one nullable enum: the gateway checks each
          // enum member against the *first* declared type and refused
          // `enum: [...ids, null]` beside `type: ["string", "null"]`.
          citationPassageId: {
            anyOf: [
              { enum: [...passageIds], type: "string" },
              { type: "null" },
            ],
          },
          path: {
            enum: CLAIM_PATHS.map((claim) => claim.path),
            type: "string",
          },
          // The union written out. `{}` is a schema strict mode refuses.
          value: {
            anyOf: [
              { type: "string" },
              { items: { type: "string" }, type: "array" },
            ],
          },
        },
        required: ["citationPassageId", "path", "value"],
        type: "object",
      },
      type: "array",
    },
  },
  required: ["fields"],
  type: "object",
});

export const exemplarsJsonSchema = (
  passageIds: readonly string[],
): JsonSchema => ({
  additionalProperties: false,
  properties: {
    exemplars: {
      items: {
        additionalProperties: false,
        properties: {
          demonstrates: { type: "string" },
          passageId: { enum: [...passageIds], type: "string" },
        },
        required: ["demonstrates", "passageId"],
        type: "object",
      },
      type: "array",
    },
  },
  required: ["exemplars"],
  type: "object",
});

/**
 * The passages both passes read, and they must be the same twenty.
 *
 * `style-extract` resolves an exemplar's id against this list and
 * `cardFromExtraction` resolves a field's citation against it, so two passes
 * seeing different sets would drop citations that were never wrong. It is
 * deterministic by construction — `listWorksByAuthor` orders by id,
 * `listPassagesForWork` by `char_start`, and `spreadAcross` is a pure function
 * of both — and shared here so it cannot become two implementations that agree
 * by accident.
 */
export const passagesFor = async (
  db: StageContext["db"],
  works: readonly {
    readonly id: string;
    readonly title: string;
    readonly year: number | null;
  }[],
): Promise<
  (StoredPassage & {
    readonly workTitle: string;
    readonly year: number | null;
  })[]
> =>
  spreadAcross(
    await Promise.all(
      works.map(async (work) =>
        (await listPassagesForWork(db, work.id)).map((passage) => ({
          ...passage,
          workTitle: work.title,
          year: work.year,
        })),
      ),
    ),
    EXTRACT_PASSAGES,
  );

/**
 * Everything both passes need: the author, the works, and the twenty passages.
 *
 * Gathered once per pass rather than handed between them, because a stage
 * receives its predecessor's *output* and not its locals — and the selection is
 * deterministic, so gathering it twice yields the same twenty.
 */
const corpusFor = async (context: StageContext) => {
  const authorId = context.session.authorId;
  if (authorId === null) {
    throw new AuteurError("invalid_input", "This session has no author.");
  }
  const author = await findAuthor(context.db, authorId);
  if (author === undefined) {
    throw new AuteurError("not_found", `${authorId} is not a known author.`);
  }
  const works = await listWorksByAuthor(context.db, authorId, cleanerVersion());
  const passages = await passagesFor(context.db, works);
  if (passages.length === 0) {
    throw new AuteurError(
      "corpus_unusable",
      "No passages were segmented from this corpus, so there is nothing to read a style from.",
    );
  }
  return { author, authorId, passages, works };
};

/**
 * `style-fields` — the twenty-two readings.
 *
 * The first of two passes. Its output is the `fields` array, which
 * `style-extract` reads back through `readStageOutput` — the same mechanism
 * every other stage boundary uses, so the two are joined by the queue rather
 * than by a function call that would put them back in one invocation.
 */
export const runStyleFields = async (
  context: StageContext,
  prosody: ProsodyBlock,
): Promise<ExtractedFields> => {
  const { author, passages } = await corpusFor(context);

  const result = await callModel(context, {
    jsonSchema: fieldsJsonSchema(passages.map((passage) => passage.id)),
    prompt: styleFields.build({
      authorName: author.displayName,
      passages: passages.map((passage) => ({
        id: passage.id,
        text: passage.text,
        workTitle: passage.workTitle,
      })),
      // A `ProsodyBlock` extends `WorkProsody`, so the corpus block is the
      // work-shaped measurement the prompt reads — no projection needed.
      prosody,
    }),
    schema: fieldsSchema,
    system: "Return only JSON matching the declared schema.",
  });

  const cited = result.fields.filter(
    (field) =>
      field.citationPassageId !== undefined && field.citationPassageId !== null,
  ).length;
  await context.emit({
    line: `${result.fields.length.toString()} readings, ${cited.toString()} cited to a passage`,
    stageId: context.stage.id,
    type: "stage_detail",
  });
  return result;
};

/**
 * `style-extract` — the exemplars, and the card.
 *
 * The second pass. It asks only for exemplars, then assembles the card from
 * those and the readings `style-fields` stored.
 *
 * §4.4: the same author, works, toolchain, prompts and model produce the same
 * card, and `build_key` is what says so. The key is computed **before** the
 * model call, so a cache hit costs nothing.
 */
export const runStyleExtract = async (
  context: StageContext,
  prosody: ProsodyBlock,
  fields: ExtractedFields,
): Promise<StyleCard> => {
  const { author, authorId, passages, works } = await corpusFor(context);
  const key = buildKey({
    authorId,
    cleanerVersion: cleanerVersion(),
    extractionModelId: context.model.id,
    extractionPromptVersion: PROMPT_VERSIONS["style-extract"],
    // Both prompts, because the card is read by both and a bump to either
    // produces a different card. One version in the key would serve a card
    // built by an older set of readings.
    fieldsPromptVersion: PROMPT_VERSIONS["style-fields"],
    prosodyVersion: prosodyVersion(),
    segmenterVersion: segmenterVersion(),
    workIds: works.map((work) => work.id),
  });

  const { exemplars } = await callModel(context, {
    jsonSchema: exemplarsJsonSchema(passages.map((passage) => passage.id)),
    prompt: styleExtract.build({
      authorName: author.displayName,
      passages: passages.map((passage) => ({
        id: passage.id,
        text: passage.text,
        workTitle: passage.workTitle,
      })),
      readings: fields.fields.map((field) => ({
        path: field.path,
        value: Array.isArray(field.value)
          ? field.value.join("; ")
          : field.value,
      })),
    }),
    schema: exemplarsSchema,
    system: "Return only JSON matching the declared schema.",
  });

  const card = cardFromExtraction({
    author: {
      displayName: author.displayName,
      id: author.id,
      kind: author.kind,
      ...(author.birthYear !== null && { birthYear: author.birthYear }),
      ...(author.deathYear !== null && { deathYear: author.deathYear }),
    },
    extraction: { exemplars, fields: fields.fields },
    passages: passages.map((passage) => ({
      id: passage.id,
      workId: passage.workId,
      workTitle: passage.workTitle,
      ...(passage.year !== null && { year: passage.year }),
    })),
    prosody,
    sources: works.map((work) => ({
      id: work.id,
      title: work.title,
      wordCount: work.wordCount,
      ...(work.translator !== null && { translator: work.translator }),
      ...(work.year !== null && { year: work.year }),
    })),
    toolchain: {
      cleaner: cleanerVersion(),
      prosody: prosodyVersion(),
      segmenter: segmenterVersion(),
    },
    version: 1,
  });

  // `putCard` decides the version and returns the existing row on a key hit, so
  // a rebuild with identical inputs does not produce a second identity for one
  // thing — which is what makes `borges@3` mean something.
  const written = await putCard(context.db, {
    authorId,
    buildKey: key,
    card,
    confidence: card.confidence,
    id: newId(),
    provenance: author.kind,
  });

  await updateSession(context.db, context.sessionId, {
    cardId: written.card.id,
  });
  await context.emit({
    line: written.inserted
      ? `card@${written.card.version.toString()} built from ${passages.length.toString()} passages`
      : `card@${written.card.version.toString()} reused — same corpus, toolchain, prompts and model`,
    stageId: context.stage.id,
    type: "stage_detail",
  });

  return written.card.card;
};
