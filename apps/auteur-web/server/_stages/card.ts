import { putCard } from "@auteur/card-store/cards";
import type { ProsodyBlock } from "@auteur/core/prosody";
import { CLAIM_PATHS, type StyleCard } from "@auteur/core/style-card";
import { findAuthor } from "@auteur/corpus-store/authors";
import { listPassagesForWork } from "@auteur/corpus-store/passages";
import { listWorksByAuthor } from "@auteur/corpus-store/works";
import { AuteurError } from "@auteur/errors/auteur-error";
import { newId } from "@auteur/ids/new-id";
import type { JsonSchema } from "@auteur/model-provider/request";
import { cardFromExtraction, extractionSchema } from "@auteur/pipeline/extract";
import { styleExtract } from "@auteur/prompt/style-extract";
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
export const extractionJsonSchema = (
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
    fields: {
      items: {
        additionalProperties: false,
        properties: {
          // Two branches rather than one nullable enum. The gateway checks each
          // enum member against the *first* declared type, so
          // `enum: [...ids, null]` beside `type: ["string", "null"]` was
          // refused whole: "Enum value None does not match declared type
          // 'string'". A union of an enumerated string and a null says the
          // same thing in a shape it accepts.
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
  required: ["exemplars", "fields"],
  type: "object",
});

export const runStyleExtract = async (
  context: StageContext,
  prosody: ProsodyBlock,
): Promise<StyleCard> => {
  const authorId = context.session.authorId;
  if (authorId === null) {
    throw new AuteurError("invalid_input", "This session has no author.");
  }
  const author = await findAuthor(context.db, authorId);
  if (author === undefined) {
    throw new AuteurError("not_found", `${authorId} is not a known author.`);
  }

  const works = await listWorksByAuthor(context.db, authorId, cleanerVersion());
  const key = buildKey({
    authorId,
    cleanerVersion: cleanerVersion(),
    extractionModelId: context.model.id,
    extractionPromptVersion: PROMPT_VERSIONS["style-extract"],
    prosodyVersion: prosodyVersion(),
    segmenterVersion: segmenterVersion(),
    workIds: works.map((work) => work.id),
  });

  const passages = spreadAcross(
    await Promise.all(
      works.map(async (work) =>
        (await listPassagesForWork(context.db, work.id)).map((passage) => ({
          ...passage,
          workTitle: work.title,
          year: work.year,
        })),
      ),
    ),
    EXTRACT_PASSAGES,
  );

  if (passages.length === 0) {
    throw new AuteurError(
      "corpus_unusable",
      "No passages were segmented from this corpus, so there is nothing to read a style from.",
    );
  }

  const extraction = await callModel(context, {
    jsonSchema: extractionJsonSchema(passages.map((passage) => passage.id)),
    prompt: styleExtract.build({
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
    schema: extractionSchema,
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
    extraction,
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
      : `card@${written.card.version.toString()} reused — same corpus, toolchain, prompt and model`,
    stageId: context.stage.id,
    type: "stage_detail",
  });

  return written.card.card;
};
