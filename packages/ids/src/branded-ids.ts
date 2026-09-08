/**
 * Branded id types.
 *
 * Every id in the system is a UUIDv7 string, so without brands they are all the
 * same type and a `WorkId` passed where a `PassageId` belongs type-checks. The
 * brand is erased at run time; it exists only to make those two arguments
 * non-interchangeable at the call site.
 *
 * `AuthorId` and `WorkId` are deliberately *not* branded uuids: they are
 * provider-scoped minted strings — `gutenberg:borges-jorge-luis-1899`,
 * `gutenberg:1234` — because gutendex has no author id of its own
 * (`docs/ARCHITECTURE.md` §5.2). They are branded as strings instead, which
 * still stops them being swapped for each other.
 */
declare const brand: unique symbol;

type Branded<Kind extends string, Base = string> = Base & {
  readonly [brand]: Kind;
};

export type SessionId = Branded<"SessionId">;
export type CardId = Branded<"CardId">;
export type PassageId = Branded<"PassageId">;
export type QuestionId = Branded<"QuestionId">;
export type StageRunId = Branded<"StageRunId">;
export type StageQueueId = Branded<"StageQueueId">;

/** Provider-scoped, minted, not a uuid. §5.2. */
export type AuthorId = Branded<"AuthorId">;
/** Provider-scoped, minted, not a uuid. */
export type WorkId = Branded<"WorkId">;

/** Every id that is a UUIDv7 and can be minted by `newId`. */
export type UuidId =
  | SessionId
  | CardId
  | PassageId
  | QuestionId
  | StageRunId
  | StageQueueId;
