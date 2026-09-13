import { storedEventSchema } from "@auteur/core/events";
import { fitMeasureSchema, styleFitReportSchema } from "@auteur/core/fit";
import { tierSchema } from "@auteur/core/pipeline";
import {
  decisionEntrySchema,
  lengthPresetSchema,
  outlineSchema,
  questionSchema,
  revisableStageSchema,
  revisionNoteSchema,
  sessionSchema,
  stepSchema,
  storySchema,
} from "@auteur/core/session";
import { styleCardSchema } from "@auteur/core/style-card";
import { z } from "zod";

/**
 * The eighteen routes, described once (decisions 0005 and 0010).
 *
 * `api-client` is generated from this same object, so a contract change breaks
 * both sides' compile together rather than one side at run time. That is the
 * whole reason the contract is a value and not a document: a document is a
 * thing two implementations agree with separately until they do not.
 *
 * Every route's request shape is here too, including `/api/internal/stage`'s —
 * **especially** `/api/internal/stage`'s. It is the one route a browser never
 * calls, which makes it the one whose body is most tempting to trust, and
 * invariant 4 does not have an exception for callers you wrote yourself.
 */

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

const idParam = z.object({ id: z.uuid() });

/** What the model panel renders, per §6.3. */
export const modelRowSchema = z.object({
  contextWindow: z.number().int().positive(),
  creator: z.string().min(1),
  displayName: z.string().min(1),
  id: z.string().min(1),
  inputPerMillion: z.number().nonnegative(),
  maxOutputTokens: z.number().int().positive(),
  structuredOutput: z.boolean(),
});

export const stageRowSchema = z.object({
  modelId: z.string().min(1).nullable(),
  pinned: z.boolean(),
  role: z.string().min(1),
  stageId: z.string().min(1),
  tier: tierSchema.nullable(),
});

/** One row on the author screen. Two of its facts are optional by design (§5.3). */
export const authorResultSchema = z.object({
  birthYear: z.number().int().nullable(),
  card: z
    .object({
      confidence: z.number().min(0).max(1),
      version: z.number().int().min(1),
    })
    .optional(),
  deathYear: z.number().int().nullable(),
  detail: z.string().min(1),
  displayName: z.string().min(1),
  id: z.string().min(1),
  kind: z.enum(["full-text", "secondary"]),
  measuredWords: z.number().int().nonnegative().optional(),
  workCount: z.number().int().nonnegative(),
});

/** Everything a reload needs, in one response (§7.1). */
export const sessionViewSchema = z.object({
  answers: z.array(questionSchema),
  card: styleCardSchema.nullable(),
  decisions: z.array(decisionEntrySchema),
  outline: outlineSchema.nullable(),
  report: styleFitReportSchema.nullable(),
  session: sessionSchema,
  story: storySchema.nullable(),
});

export const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;
export type Method = (typeof METHODS)[number];

export type RouteSpec = {
  readonly method: Method;
  readonly path: string;
  readonly params?: z.ZodType;
  readonly query?: z.ZodType;
  readonly body?: z.ZodType;
  readonly response: z.ZodType;
  /**
   * True for `/api/internal/stage`. Signed with a shared secret and never reached
   * by a browser — which is not authentication and must not be called that:
   * it identifies no one, and naming it authentication invites a permission
   * model on top of a value that carries no principal.
   */
  readonly internal?: true;
  /**
   * True for the SSE route. It is the **only** route that reads the direct
   * connection string, because `LISTEN` is a session-level feature a pooled
   * connection cannot honour — and a pooled `LISTEN` is accepted and then
   * simply never delivers.
   */
  readonly stream?: true;
};

export const ROUTES = {
  advance: {
    body: z.object({ to: stepSchema }),
    method: "POST",
    params: idParam,
    path: "/api/sessions/:id/advance",
    // The queue rows it enqueued, and nothing has run yet.
    response: z.object({ enqueued: z.array(z.string().min(1)) }),
  },
  answers: {
    body: z.object({
      answer: z.string().min(1).nullable(),
      questionId: z.uuid(),
    }),
    method: "POST",
    params: idParam,
    path: "/api/sessions/:id/answers",
    response: z.object({
      /** Every transitive descendant the edit invalidated. §6.5's tree. */
      invalidated: z.array(z.uuid()),
      questions: z.array(questionSchema),
    }),
  },
  authors: {
    method: "GET",
    path: "/api/authors",
    query: z.object({ q: z.string().min(1) }),
    response: z.object({
      results: z.array(authorResultSchema),
      /** A provider that threw. The union still returns; its absence is said. */
      unavailable: z.array(z.string().min(1)),
    }),
  },
  cancel: {
    method: "POST",
    params: idParam,
    path: "/api/sessions/:id/cancel",
    response: z.object({ cancelling: z.boolean() }),
  },
  createSession: {
    body: z.object({
      constraints: z.string().nullable().optional(),
      idea: z.string().min(1),
      lengthPreset: lengthPresetSchema,
    }),
    method: "POST",
    path: "/api/sessions",
    response: sessionSchema,
  },
  deleteSession: {
    method: "DELETE",
    params: idParam,
    path: "/api/sessions/:id",
    response: z.object({ deleted: z.boolean() }),
  },
  events: {
    method: "GET",
    params: idParam,
    path: "/api/sessions/:id/events",
    query: z.object({ cursor: z.coerce.number().int().nonnegative() }),
    // Documented as the frame shape; the transport is text/event-stream.
    response: storedEventSchema,
    stream: true,
  },
  exportStory: {
    method: "GET",
    params: idParam,
    path: "/api/sessions/:id/export",
    // text/markdown. A string, because the label is inside it and no shape
    // this contract could describe would make that checkable.
    response: z.string().min(1),
  },
  health: {
    method: "GET",
    path: "/api/health",
    response: z.object({ ok: z.literal(true) }),
  },
  internalStage: {
    body: z.object({
      queueId: z.uuid(),
      sessionId: z.uuid(),
      stageId: z.string().min(1),
    }),
    internal: true,
    method: "POST",
    path: "/api/internal/stage",
    response: z.object({
      claimed: z.boolean(),
      enqueued: z.array(z.string().min(1)),
      /**
       * How the stage ended, for a caller that has no other way to tell.
       *
       * `claimed: true, enqueued: []` was the answer for a stage that finished
       * with no successor *and* for one that failed, so the response said
       * nothing about the only thing it was asked. Absent when the row was not
       * claimed, because then this invocation ran no stage at all.
       */
      outcome: z.enum(["done", "error"]).optional(),
    }),
  },
  internalSweep: {
    // GET, because that is how the platform's scheduler invokes a path. It
    // carries no body to sign, which is why this route takes a bearer token
    // rather than `/api/internal/stage`'s HMAC.
    internal: true,
    method: "GET",
    path: "/api/internal/cron/sweep",
    response: z.object({
      failed: z.array(z.string().min(1)),
      reinvoked: z.array(z.string().min(1)),
      released: z.array(z.string().min(1)),
    }),
  },
  models: {
    method: "GET",
    path: "/api/models",
    response: z.object({
      models: z.array(modelRowSchema),
      stages: z.array(stageRowSchema),
    }),
  },
  /**
   * `POST /api/sessions/:id/notes` — say what is wrong with what you read.
   *
   * It does not re-run anything, and that is the same arrangement `answers`
   * has: filing a note changes the note set, which changes the stage's input
   * key, which is what `POST /advance` reads. The consequences are §7.5's
   * rather than this route's, so there is no second opinion anywhere about
   * what a note invalidates.
   *
   * The response is the whole list for that stage, not the row just written.
   * The screen renders the notes so far, and a client that had to append the
   * new one itself would be a second place the order is decided.
   */
  notes: {
    body: z.object({
      note: z.string().trim().min(1).max(2000),
      stageId: revisableStageSchema,
    }),
    method: "POST",
    params: idParam,
    path: "/api/sessions/:id/notes",
    response: z.object({ notes: z.array(revisionNoteSchema) }),
  },
  patchSession: {
    body: z.object({
      constraints: z.string().nullable().optional(),
      idea: z.string().min(1).optional(),
      lengthPreset: lengthPresetSchema.optional(),
      step: stepSchema.optional(),
    }),
    method: "PATCH",
    params: idParam,
    path: "/api/sessions/:id",
    response: sessionSchema,
  },
  pins: {
    body: z.object({ pins: z.record(z.string().min(1), z.string().min(1)) }),
    method: "PUT",
    params: idParam,
    path: "/api/sessions/:id/pins",
    response: z.object({
      pins: z.record(z.string().min(1), z.string().min(1)),
    }),
  },
  regenerate: {
    body: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("outline") }),
      z.object({
        from: z.number().int().nonnegative(),
        kind: z.literal("selection"),
        to: z.number().int().nonnegative(),
      }),
    ]),
    method: "POST",
    params: idParam,
    path: "/api/sessions/:id/regenerate",
    response: z.object({ enqueued: z.array(z.string().min(1)) }),
  },
  selectAuthor: {
    /**
     * The whole row the screen is showing, not just its id.
     *
     * `sessions.author_id` references `authors(id)`, and nothing had ever
     * written that table: search reads Gutendex and deliberately does not
     * store what it finds, because typing a name must not fetch a corpus. So
     * the row arrives with the choice — the client is holding it already — and
     * this is the moment an author becomes something this system knows about.
     */
    body: z.object({ author: authorResultSchema }),
    method: "POST",
    params: idParam,
    path: "/api/sessions/:id/author",
    response: z.object({ enqueued: z.array(z.string().min(1)) }),
  },
  session: {
    method: "GET",
    params: idParam,
    path: "/api/sessions/:id",
    response: sessionViewSchema,
  },
} as const satisfies Record<string, RouteSpec>;

export type RouteName = keyof typeof ROUTES;
export type Routes = typeof ROUTES;

export const ROUTE_NAMES = Object.keys(ROUTES) as RouteName[];

/**
 * A route as `RouteSpec`, rather than as its own narrow literal type.
 *
 * `ROUTES` is `as const satisfies Record<string, RouteSpec>`, which is what
 * gives `api-client` a per-route body and response type. The cost is that
 * `ROUTES[name]` for a `name: RouteName` is a *union* of sixteen object types,
 * and an optional field one member omits does not exist on the union at all —
 * so `spec.internal` does not type-check even though every member either has it
 * or does not.
 *
 * This is the widening, in one place. Reading `spec.params` off a union of
 * sixteen shapes at each call site would be sixteen casts.
 */
export const specOf = (name: RouteName): RouteSpec => ROUTES[name];

/** The measure schema, re-exported so a client need not reach into `core`. */
export { fitMeasureSchema };
