import { z } from "zod";
import { originSchema } from "./fit.ts";
import { prosodyBlockSchema, prosodyTargetSchema } from "./prosody.ts";

export const citationSchema = z.object({
  passageId: z.uuid(),
  workId: z.string().min(1),
  workTitle: z.string().min(1),
});
export type Citation = z.infer<typeof citationSchema>;

/**
 * Every qualitative field the card presents is wrapped in this. Invariant 2:
 * every claim carries its provenance.
 *
 * The `superRefine` is the invariant in force rather than in prose — a
 * `derived` claim **must** carry the passage it was read from. A derived field
 * with no evidence is exactly what the provenance mechanism exists to catch,
 * and catching it at the parse boundary means it cannot reach a card, a report
 * or an export.
 */
export const claimSchema = <Value extends z.ZodType>(value: Value) =>
  z
    .object({
      citation: citationSchema.optional(),
      origin: originSchema,
      value,
    })
    .superRefine((claim, ctx) => {
      if (claim.origin === "derived" && claim.citation === undefined) {
        ctx.addIssue({
          code: "custom",
          message:
            "a derived claim must cite the passage it was read from (invariant 2)",
          path: ["citation"],
        });
      }
    });

/**
 * A claim about the corpus rather than about a passage.
 *
 * Some readings cannot be pointed at a passage **by construction**, and asking
 * for a citation is asking for a fabrication — which is the one thing invariant
 * 2 exists to prevent. Two kinds:
 *
 * - **Absence.** `antiPatterns` and `diction.avoidedRegisters` say what this
 *   author does *not* do. No passage exhibits an absence; a citation for one
 *   would point at a passage that does not contain the thing being claimed.
 * - **Recurrence.** `imagery.motifs`, `structure.typicalShapes` and their
 *   neighbours are claims about frequency across the corpus. One passage can
 *   illustrate a motif and cannot establish that it recurs, so a citation would
 *   overstate what a single passage shows.
 *
 * So these carry `origin: "measured"` — read from the corpus as a whole, which
 * is what they are — and no citation, and `claimSchema` already permits that:
 * its refinement binds `derived` alone. Nothing here loosens invariant 2. It
 * stops applying it to claims it was never about, which is the state that made
 * a card unbuildable whenever a model answered honestly.
 *
 * `docs/decisions/0031` has the run that forced it: 22 of 22 paths returned, 15
 * cited, and the seven uncited were these.
 */
const stringClaim = claimSchema(z.string().min(1));
const stringsClaim = claimSchema(z.array(z.string().min(1)));

export const authorRefSchema = z.object({
  birthYear: z.number().int().optional(),
  deathYear: z.number().int().optional(),
  displayName: z.string().min(1),
  id: z.string().min(1),
  kind: z.enum(["full-text", "secondary"]),
});
export type AuthorRef = z.infer<typeof authorRefSchema>;

export const workRefSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  translator: z.string().optional(),
  wordCount: z.number().int().nonnegative(),
  year: z.number().int().optional(),
});
export type WorkRef = z.infer<typeof workRefSchema>;

/**
 * The four facts the UI shows beside confidence, unblended (§4.5).
 *
 * An earlier draft blended these into one weighted scalar. The weights were
 * invented, and a two-decimal number produced from invented weights claims a
 * precision it does not have — so the facts are shown as themselves and the
 * reader who cares about corpus concentration can see it rather than have it
 * averaged into invisibility.
 */
export const cardStrengthSchema = z.object({
  citedDerivedFields: z.number().int().nonnegative(),
  derivedFields: z.number().int().nonnegative(),
  largestWorkShare: z.number().min(0).max(1),
  measuredWords: z.number().int().nonnegative(),
  workCount: z.number().int().nonnegative(),
});
export type CardStrength = z.infer<typeof cardStrengthSchema>;

export const exemplarSchema = z.object({
  demonstrates: z.string().min(1),
  passageId: z.uuid(),
  workId: z.string().min(1),
  workTitle: z.string().min(1),
  year: z.number().int().optional(),
});
export type Exemplar = z.infer<typeof exemplarSchema>;

/**
 * Every qualitative field the card requires, and what shape its value takes.
 *
 * The extraction stage returns `{path, value}` pairs and the assembler writes
 * them into the card at those paths. `styleCardSchema` requires **all** of
 * them, so a card does not build unless every one arrives — and the model was
 * never told what any of them were. It returned no fields at all and one
 * invented passage id, which is the honest response to a request that describes
 * the card in prose and names none of it.
 *
 * The list is here, beside the schema it has to agree with, and
 * `style-card`'s own test builds a card from exactly these paths: a path added
 * to the schema and not to this list fails that build, which is the check that
 * keeps the two together.
 *
 * `line` is one sentence and `list` is several — the difference between
 * `stringClaim` and `stringsClaim` above, said in a word a prompt can use.
 */
export type ClaimPath = {
  readonly path: string;
  readonly kind: "line" | "list";
  /**
   * What evidences it.
   *
   * `passage` — a reading taken from one passage, which must cite it.
   * `corpus` — an absence or a recurrence, which no single passage can
   * establish and which therefore carries no citation at all.
   *
   * **Every `list` is a `corpus` claim, and every `line` is a `passage` one.**
   * Not a coincidence: a list value is a claim about *several* things, and
   * several is a frequency — what an author's opening moves *are*, plural, is
   * a claim about what recurs, and one passage shows one opening. A single
   * reading is what a single passage can carry.
   *
   * Three lists were on the passage side and a real model returned all three
   * with no citation, twice, identically: `rhythm.devices`,
   * `structure.closingMoves`, `structure.openingMoves`. It was right and the
   * classification was wrong. `style-card`'s tests hold the alignment, so a
   * future claim that breaks it is a decision somebody makes rather than one
   * that slips through.
   */
  readonly evidence: "passage" | "corpus";
};

export const CLAIM_PATHS: readonly ClaimPath[] = [
  { evidence: "corpus", kind: "list", path: "antiPatterns" },
  { evidence: "passage", kind: "line", path: "dialogue.dialectRendering" },
  {
    evidence: "passage",
    kind: "line",
    path: "dialogue.speechToNarrationBalance",
  },
  { evidence: "passage", kind: "line", path: "dialogue.tagConventions" },
  { evidence: "corpus", kind: "list", path: "diction.avoidedRegisters" },
  { evidence: "passage", kind: "line", path: "diction.concreteness" },
  { evidence: "passage", kind: "line", path: "diction.register" },
  { evidence: "corpus", kind: "list", path: "diction.signatureLexicon" },
  { evidence: "corpus", kind: "list", path: "imagery.motifs" },
  { evidence: "corpus", kind: "list", path: "imagery.preoccupations" },
  { evidence: "corpus", kind: "list", path: "imagery.recurringImages" },
  { evidence: "corpus", kind: "list", path: "rhythm.devices" },
  { evidence: "passage", kind: "line", path: "rhythm.repetitionHabits" },
  { evidence: "corpus", kind: "list", path: "structure.closingMoves" },
  { evidence: "corpus", kind: "list", path: "structure.openingMoves" },
  { evidence: "passage", kind: "line", path: "structure.sceneVsSummary" },
  { evidence: "corpus", kind: "list", path: "structure.typicalShapes" },
  { evidence: "passage", kind: "line", path: "voice.freeIndirect" },
  { evidence: "passage", kind: "line", path: "voice.narratorDistance" },
  { evidence: "passage", kind: "line", path: "voice.pov" },
  { evidence: "passage", kind: "line", path: "voice.reliability" },
  { evidence: "passage", kind: "line", path: "voice.tense" },
];

/** How many exemplars a card carries. Stated once; the prompt says it too. */
export const EXEMPLARS = { max: 15, min: 8 } as const;

export const styleCardSchema = z.object({
  antiPatterns: stringsClaim,
  author: authorRefSchema,
  cardStrength: cardStrengthSchema,
  /** Citation coverage, and nothing else. §4.5. */
  confidence: z.number().min(0).max(1),
  dialogue: z.object({
    dialectRendering: stringClaim,
    speechToNarrationBalance: stringClaim,
    tagConventions: stringClaim,
  }),
  diction: z.object({
    avoidedRegisters: stringsClaim,
    concreteness: stringClaim,
    register: stringClaim,
    signatureLexicon: stringsClaim,
  }),
  exemplars: z.array(exemplarSchema).min(EXEMPLARS.min).max(EXEMPLARS.max),
  id: z.uuid(),
  imagery: z.object({
    motifs: stringsClaim,
    preoccupations: stringsClaim,
    recurringImages: stringsClaim,
  }),
  measuredWords: z.number().int().nonnegative(),
  /** Not wrapped in Claim, deliberately. See prosody.ts. */
  prosody: prosodyBlockSchema,
  prosodyTarget: prosodyTargetSchema,
  provenance: z.enum(["full-text", "secondary"]),
  rhythm: z.object({
    devices: stringsClaim,
    repetitionHabits: stringClaim,
  }),
  sources: z.array(workRefSchema),
  structure: z.object({
    closingMoves: stringsClaim,
    openingMoves: stringsClaim,
    sceneVsSummary: stringClaim,
    typicalShapes: stringsClaim,
  }),
  toolchain: z.object({
    cleaner: z.string().min(1),
    prosody: z.string().min(1),
    segmenter: z.string().min(1),
  }),
  version: z.number().int().min(1),
  voice: z.object({
    freeIndirect: stringClaim,
    narratorDistance: stringClaim,
    pov: stringClaim,
    reliability: stringClaim,
    tense: stringClaim,
  }),
});
export type StyleCard = z.infer<typeof styleCardSchema>;

/** Per-session overrides. Never merged into the cached canonical card. */
export const cardOverlaySchema = z.object({
  cardId: z.uuid(),
  fields: z.record(
    z.string(),
    z.object({
      origin: z.enum(["derived", "edited"]),
      reason: z.string().optional(),
      value: z.unknown(),
    }),
  ),
  sessionId: z.uuid(),
});
export type CardOverlay = z.infer<typeof cardOverlaySchema>;
