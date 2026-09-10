import type { ProsodyBlock } from "@auteur/core/prosody";
import type {
  AuthorRef,
  Exemplar,
  StyleCard,
  WorkRef,
} from "@auteur/core/style-card";
import { EXEMPLARS } from "@auteur/core/style-card";
import { AuteurError } from "@auteur/errors/auteur-error";
import type { Evidence } from "@auteur/style-card/build";
import { buildCard } from "@auteur/style-card/build";
import { z } from "zod";

/**
 * `style-extract`, wired end to end.
 *
 * This lives in `pipeline` rather than in `style-card`, and the reason is the
 * dependency gate: calling a model needs `prompt` and a provider, both
 * `agent`-layer, and `style-card` is `service`-layer. `buildCard` takes
 * `Evidence[]` precisely so the assembly can stay down there while the call
 * stays up here.
 */

/**
 * What the stage returns, parsed.
 *
 * A citation is `passageId` only. The stage is given passage ids and can return
 * one; it is not given work titles in a form it could reliably echo, and asking
 * it to would be asking it to restate data the caller already holds — which is
 * how a citation ends up naming a work the passage does not belong to.
 */
export const extractedFieldSchema = z.object({
  // Nullable as well as optional. The gateway's strict `json_schema` mode
  // requires every property in `required`, so "no citation for this field" can
  // only be sent as `null` — and a schema that accepted only `undefined` made
  // every uncited field fail the parse of the whole extraction.
  citationPassageId: z.uuid().nullish(),
  path: z.string().min(1),
  value: z.union([z.string().min(1), z.array(z.string().min(1))]),
});

/**
 * The two halves, separately, because two stages produce them.
 *
 * One model call returning both needed more than the sixty seconds an
 * invocation gets. `style-fields` returns the readings and `style-extract`
 * returns the exemplars that demonstrate them, so each call is a fraction of
 * the output the single one had to generate.
 *
 * `extractionSchema` is still the shape the card is assembled from — the halves
 * are composed rather than replaced, so `cardFromExtraction` takes one object
 * and neither stage has an opinion about how the other's output is stored.
 */
export const fieldsSchema = z.object({
  fields: z.array(extractedFieldSchema).min(1),
});
export type ExtractedFields = z.infer<typeof fieldsSchema>;

export const exemplarsSchema = z.object({
  exemplars: z
    .array(
      z.object({
        demonstrates: z.string().min(1),
        passageId: z.uuid(),
      }),
    )
    .min(EXEMPLARS.min)
    .max(EXEMPLARS.max),
});
export type ExtractedExemplars = z.infer<typeof exemplarsSchema>;

export const extractionSchema = z.object({
  ...exemplarsSchema.shape,
  ...fieldsSchema.shape,
});
export type Extraction = z.infer<typeof extractionSchema>;

export type PassageRef = {
  readonly id: string;
  readonly workId: string;
  readonly workTitle: string;
  readonly year?: number;
};

export const parseExtraction = (payload: unknown): Extraction => {
  const parsed = extractionSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AuteurError(
      "schema_violation",
      "The style-extract stage returned something that is not a card.",
      { detail: { issues: parsed.error.issues } },
    );
  }
  return parsed.data;
};

/**
 * Turn the parsed extraction into evidence, resolving each citation.
 *
 * **A citation naming a passage that was not offered is dropped, not
 * resolved.** The model was given the ids; one it invented points at nothing,
 * and carrying it forward would put a citation on the card that resolves to no
 * passage — which is invariant 2 failing in the one way a reader cannot detect,
 * because the mark is there and the link is dead.
 *
 * The field survives as an uncited attempt, which is decision `0004`'s
 * arrangement: it counts against `confidence` and does not reach the card.
 */
export const toEvidence = (
  extraction: Extraction,
  passages: readonly PassageRef[],
): Evidence[] => {
  const byId = new Map(passages.map((passage) => [passage.id, passage]));
  return extraction.fields.map((field) => {
    const cited = field.citationPassageId;
    const passage =
      cited === undefined || cited === null ? undefined : byId.get(cited);
    return {
      path: field.path,
      value: field.value,
      ...(passage !== undefined && {
        citation: {
          passageId: passage.id,
          workId: passage.workId,
          workTitle: passage.workTitle,
        },
      }),
    };
  });
};

/** The same rule for exemplars: one citing a passage nobody offered is dropped. */
export const toExemplars = (
  extraction: Extraction,
  passages: readonly PassageRef[],
): Exemplar[] => {
  const byId = new Map(passages.map((passage) => [passage.id, passage]));
  return extraction.exemplars.flatMap((exemplar) => {
    const passage = byId.get(exemplar.passageId);
    if (passage === undefined) return [];
    return [
      {
        demonstrates: exemplar.demonstrates,
        passageId: passage.id,
        workId: passage.workId,
        workTitle: passage.workTitle,
        ...(passage.year !== undefined && { year: passage.year }),
      },
    ];
  });
};

export type ExtractInput = {
  readonly extraction: Extraction;
  readonly passages: readonly PassageRef[];
  readonly author: AuthorRef;
  readonly sources: readonly WorkRef[];
  readonly prosody: ProsodyBlock;
  readonly toolchain: {
    readonly cleaner: string;
    readonly prosody: string;
    readonly segmenter: string;
  };
  readonly version: number;
};

export const cardFromExtraction = (input: ExtractInput): StyleCard =>
  buildCard({
    author: input.author,
    evidence: toEvidence(input.extraction, input.passages),
    exemplars: toExemplars(input.extraction, input.passages),
    prosody: input.prosody,
    sources: input.sources,
    toolchain: input.toolchain,
    version: input.version,
  });
