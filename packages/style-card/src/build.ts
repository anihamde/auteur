import type { ProsodyBlock, ProsodyTarget } from "@auteur/core/prosody";
import type {
  AuthorRef,
  CardOverlay,
  Exemplar,
  StyleCard,
  WorkRef,
} from "@auteur/core/style-card";
import { CLAIM_PATHS, styleCardSchema } from "@auteur/core/style-card";
import { AuteurError } from "@auteur/errors/auteur-error";
import { newId } from "@auteur/ids/new-id";
import { cardStrengthOf, confidenceOf } from "./strength.ts";

/**
 * Assembling a card from evidence and a measurement.
 *
 * **This function takes `Evidence[]` and no provider.** Calling the extraction
 * stage is `pipeline`'s job; this package is `service`-layer and a provider is
 * `agent`-layer, so the edge would be upward and the dependency gate refuses
 * it. The practical consequence is better than the layering one: a card can be
 * built in a test from a hand-written evidence list, with no scripted stream
 * and no schema round trip.
 */

/**
 * One field the extraction stage returned.
 *
 * `citation` is optional on the way in and **required on the card**. Invariant
 * 2 is absolute: `claimSchema` refuses a `derived` claim with no citation at
 * the parse boundary, so there is no shape this assembler could produce that
 * would carry one.
 *
 * So an uncited field is **not written to the card, and is counted in the
 * denominator of `confidence`**. `docs/decisions/0004` works through why that
 * is the resolution rather than storing it uncited: the reading may well be
 * right, but a card holding a claim with nothing behind it is exactly what the
 * provenance mechanism exists to prevent, and a reader who follows one citation
 * that does not support its claim stops trusting the ones that do.
 *
 * The gap is not hidden. `cardStrength.derivedFields` counts every field the
 * extraction attempted and `citedDerivedFields` counts the ones it could
 * support, so a card where the model could point at two thirds of its readings
 * says so — and if the missing field is one the schema requires, the card does
 * not build at all, which is the correct failure for a card that cannot keep
 * its own promise.
 */
export type Evidence = {
  /** A dotted path into the card, e.g. `voice.pov`. */
  readonly path: string;
  readonly value: string | readonly string[];
  readonly citation?: {
    readonly passageId: string;
    readonly workId: string;
    readonly workTitle: string;
  };
};

export type BuildInput = {
  readonly author: AuthorRef;
  readonly sources: readonly WorkRef[];
  readonly prosody: ProsodyBlock;
  readonly evidence: readonly Evidence[];
  readonly exemplars: readonly Exemplar[];
  readonly toolchain: {
    readonly cleaner: string;
    readonly prosody: string;
    readonly segmenter: string;
  };
  readonly version: number;
  readonly id?: string;
};

/**
 * The target equals the measurement, field for field.
 *
 * §4.6: nothing edits a target, and in v1 nothing writes an overlay at all. The
 * draft prompt carries a precedence clause instead, so the report keeps one
 * basis and the drift is reported against the number that was measured rather
 * than against one the product invented.
 */
export const targetFromProsody = (prosody: ProsodyBlock): ProsodyTarget => ({
  dialogueRatio: prosody.dialogueRatio,
  latinateRatio: prosody.latinateRatio,
  mattr: prosody.mattr,
  punctuation: prosody.punctuation,
  sentenceLength: prosody.sentenceLength,
});

/** The paths no passage can evidence. See `CLAIM_PATHS`. */
const CORPUS_CLAIMS = new Set(
  CLAIM_PATHS.filter((claim) => claim.evidence === "corpus").map(
    (claim) => claim.path,
  ),
);

const setPath = (
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void => {
  const parts = path.split(".");
  const last = parts.pop();
  if (last === undefined) return;
  let cursor = target;
  for (const part of parts) {
    const next = cursor[part];
    if (typeof next !== "object" || next === null) {
      const created: Record<string, unknown> = {};
      cursor[part] = created;
      cursor = created;
      continue;
    }
    cursor = next as Record<string, unknown>;
  }
  cursor[last] = value;
};

/**
 * Build the card, then parse it.
 *
 * Parsed rather than cast, and by the same schema every other boundary uses.
 * `claimSchema`'s refinement is what stops a derived claim with no citation
 * from reaching a card — so a bug in this assembler that dropped a citation
 * fails here, at the place that knows which field it was, rather than in a
 * report three stages later.
 */
export const buildCard = (input: BuildInput): StyleCard => {
  const draft: Record<string, unknown> = {
    author: input.author,
    exemplars: [...input.exemplars],
    id: input.id ?? newId(),
    measuredWords: input.prosody.words,
    prosody: input.prosody,
    prosodyTarget: targetFromProsody(input.prosody),
    provenance: input.author.kind,
    sources: [...input.sources],
    toolchain: input.toolchain,
    version: input.version,
  };

  // A claim about the corpus — an absence, or a recurrence — carries no
  // citation and is written anyway, as `measured`: it was read from the corpus
  // as a whole and no passage could establish it. A claim about a passage that
  // arrives without one is dropped, which is decision 0004 unchanged.
  for (const field of input.evidence) {
    const corpus = CORPUS_CLAIMS.has(field.path);
    if (field.citation === undefined && !corpus) continue;
    setPath(draft, field.path, {
      // A corpus claim carries no citation even when one is offered. Its
      // `origin` says it was read from the corpus, and a passage citation
      // beside that says it was read from one passage — the two cannot both be
      // true, and the citation is the half that is wrong: one passage cannot
      // establish an absence or a recurrence. A model that sends one anyway is
      // offering support the claim does not have.
      ...(field.citation !== undefined &&
        !corpus && { citation: field.citation }),
      origin: corpus ? "measured" : "derived",
      value: Array.isArray(field.value) ? [...field.value] : field.value,
    });
  }

  // The denominator is what the extraction **attempted**, not what landed on
  // the card. Counting only what landed would make every card 1.00: the uncited
  // fields are exactly the ones that did not land, so a coverage figure computed
  // from the card alone measures nothing.
  //
  // Attempted paths are deduplicated, because a model returning the same field
  // twice attempted it once.
  //
  // **Corpus claims are in neither.** Coverage answers "how much of what could
  // be cited was", and a claim that cannot be cited by construction belongs in
  // no part of that ratio: in the denominator it would cap every card below
  // 1.00 for doing nothing wrong, and in the numerator it would count evidence
  // that does not exist.
  const claims = input.evidence.filter(
    (field) => !CORPUS_CLAIMS.has(field.path),
  );
  const attempted = new Set(claims.map((field) => field.path));
  const cited = new Set(
    claims
      .filter((field) => field.citation !== undefined)
      .map((field) => field.path),
  );

  draft["confidence"] = confidenceOf(attempted.size, cited.size);
  draft["cardStrength"] = cardStrengthOf({
    citedDerivedFields: cited.size,
    derivedFields: attempted.size,
    measuredWords: input.prosody.words,
    wordsPerWork: input.sources.map((source) => source.wordCount),
    workCount: input.sources.length,
  });

  const parsed = styleCardSchema.safeParse(draft);
  if (!parsed.success) {
    throw new AuteurError(
      "schema_violation",
      "The style card the extraction produced is not a valid card.",
      { detail: { issues: parsed.error.issues } },
    );
  }
  return parsed.data;
};

/** Re-exported so a caller need not import two modules to render an overlay. */
export type { CardOverlay };
