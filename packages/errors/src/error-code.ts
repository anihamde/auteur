/**
 * The closed error taxonomy, from `docs/ARCHITECTURE.md` §7.4.
 *
 * Every error thrown from `packages/` carries a code from this set. The set is
 * closed so that `toHttpResponse` can map it exhaustively and a new code cannot
 * be added without deciding what status it means.
 */
export const ERROR_CODES = [
  /** The thing asked for does not exist. */
  "not_found",
  /** The request did not parse, or violated a stated constraint. */
  "invalid_input",
  /** gutendex is down, or a selected work will not fetch. */
  "corpus_unavailable",
  /** Fetched, but no Project Gutenberg markers — see §4.2. */
  "corpus_unusable",
  /** The gateway or the model failed. */
  "provider_error",
  /** The gateway rate-limited us. */
  "rate_limited",
  /** The pinned or resolved model 404s at the gateway. */
  "model_unavailable",
  /** A stage's output did not parse. Invariant 4. */
  "schema_violation",
  /** A round or question budget was asked past. */
  "budget_exceeded",
  /** The caller cancelled. */
  "cancelled",
  /** Anything unexpected. Its message is never forwarded. */
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * The HTTP status each code maps to.
 *
 * `docs/ARCHITECTURE.md` §7.4: none of nexus's status-as-security-property
 * reasoning applies, because auteur is single-user and a 404 hides nothing a
 * 403 would reveal. So the mapping is the ordinary one.
 *
 * `schema_violation` is 502 rather than 500 deliberately: the call succeeded
 * and the *output* was wrong, which is a prompt or schema bug and is fixed in a
 * different file from a gateway failure.
 */
export const STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  budget_exceeded: 409,
  cancelled: 499,
  corpus_unavailable: 502,
  corpus_unusable: 422,
  internal: 500,
  invalid_input: 400,
  model_unavailable: 409,
  not_found: 404,
  provider_error: 502,
  rate_limited: 429,
  schema_violation: 502,
};

export const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === "string" &&
  (ERROR_CODES as readonly string[]).includes(value);
