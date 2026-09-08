import { AuteurError } from "@auteur/errors/auteur-error";
import { APIError } from "openai";

/**
 * Every way this adapter can fail, expressed in the error taxonomy.
 *
 * The rule the package exists to keep is that **no `openai` SDK error ever
 * escapes**. Everything upstream catches `AuteurError` and nothing else; an
 * `APIError` reaching a route would be an untyped 500 carrying a vendor's
 * wording into a product surface.
 *
 * Three codes, and the choice is the status rather than the message:
 *
 * - `rate_limited` for a 429, and for the in-stream `rate_limit_exceeded` that
 *   arrives with no status at all. This API can fail *after* a 200's headers,
 *   leaving the frame's own `code` as the only signal — once a stream commits
 *   it cannot change the status, so a late failure is a truncated event
 *   stream. A rate limit classified as a model failure would be
 *   indistinguishable from one, and the two want opposite responses.
 * - `model_unavailable` for a 404, which under a gateway means one thing: the
 *   model named is not there any more. That is almost always a `stage_pins`
 *   row outliving a catalogue entry, and it is the panel's to fix rather than
 *   the pipeline's to retry.
 * - `provider_error` for everything else — other statuses, connection
 *   failures, and a body that did not parse.
 *
 * `cancelled` is the fourth, and it is not a failure: an abort is what the
 * caller asked for. The SDK raises it from the same place as everything else,
 * so it is classified here rather than at each call site that could have
 * aborted.
 *
 * **This SDK version throws the in-stream `error` frame rather than yielding
 * it.** Both entrances are kept — `fromStreamError` for a decoder that yields,
 * `asAuteurError` for one that throws — because the frame carries `code` in
 * both shapes and the rule about it is the same. Deleting the unused one would
 * mean rediscovering the rule on the next SDK upgrade.
 *
 * The gateway's own vocabulary rides along in `detail` untranslated: `code`
 * carries `invalid_api_key`, `insufficient_credits`, `model_not_found` and the
 * rest exactly as sent. Nothing branches on them — a gateway is free to add
 * one, and a taxonomy that had to be edited before a new code could be read
 * would be a taxonomy that loses the code — but they are the finer label a
 * reader gets.
 *
 * The provider's own message goes in `detail`, never in the `AuteurError`'s
 * message, which is what a user reads. Before it goes anywhere it is passed
 * through `redactSecrets`: an authentication failure quotes the key it
 * rejected back at you.
 */

export const ROUTER_PROVIDER_ID = "ramp-router";

const TOO_MANY_REQUESTS = 429;
const NOT_FOUND = 404;
const RATE_LIMIT_CODE = "rate_limit_exceeded";

/** Shortest key searched for verbatim; below this, false positives win. */
const MINIMUM_KEY_LENGTH = 8;

/**
 * `sk-proj-…`, and any other key-shaped token the gateway echoes back.
 *
 * A second line of defence rather than the first. A request that fails at a
 * provider can quote a provider key this system never held — so the reliable
 * half is redacting the configured key verbatim, and this catches what that
 * cannot see.
 */
const KEY_SHAPED = /sk-[A-Za-z0-9_-]{6,}/g;
const REDACTED = "[redacted]";

/**
 * Remove anything key-shaped from text about to be stored or logged.
 *
 * Two passes, because either alone leaks: the configured key verbatim — it is
 * the one secret held and the one an error is most likely to quote — and
 * anything else shaped like an API key by pattern.
 */
export const redactSecrets = (text: string, apiKey?: string): string => {
  const withoutKey =
    apiKey !== undefined && apiKey.length >= MINIMUM_KEY_LENGTH
      ? text.split(apiKey).join(REDACTED)
      : text;
  return withoutKey.replaceAll(KEY_SHAPED, REDACTED);
};

export type ProviderFailureDetail = {
  readonly provider: string;
  readonly reason: string;
  readonly code?: string;
  readonly type?: string;
  readonly status?: number;
  readonly requestId?: string;
};

const isRateLimitBody = (error: APIError): boolean => {
  const body: unknown = error.error;
  if (typeof body !== "object" || body === null) return false;
  const code: unknown = Reflect.get(body, "code");
  return code === RATE_LIMIT_CODE;
};

const detailOf = (error: APIError, apiKey?: string): ProviderFailureDetail => ({
  // `code` is the finer of the two labels — `insufficient_quota` and
  // `context_length_exceeded` are both 400s and want different sentences — and
  // `type` is the coarse family. Both, because either can be absent.
  ...(typeof error.code === "string" && { code: error.code }),
  provider: ROUTER_PROVIDER_ID,
  reason: redactSecrets(error.message, apiKey),
  ...(typeof error.requestID === "string" && { requestId: error.requestID }),
  ...(typeof error.status === "number" && { status: error.status }),
  ...(typeof error.type === "string" && { type: error.type }),
});

const isAbort = (thrown: unknown): boolean =>
  thrown instanceof Error &&
  (thrown.name === "AbortError" || thrown.name === "APIUserAbortError");

const MESSAGE_BY_CODE = {
  cancelled: "The session was cancelled.",
  model_unavailable: "The model this stage runs on is not available.",
  provider_error: "The model gateway failed.",
  rate_limited: "The model gateway is rate-limiting this session.",
} as const;

/**
 * An `error` event the Responses stream yielded, in the taxonomy.
 *
 * The same judgement `asAuteurError` makes about a thrown `APIError` with no
 * status, reached from the other side: a stream that fails after its 200 has no
 * status to read, so the frame's `code` is the whole signal.
 */
export const fromStreamError = (
  event: { readonly code?: string | null; readonly message: string },
  apiKey?: string,
): AuteurError => {
  const detail: ProviderFailureDetail = {
    ...(typeof event.code === "string" && { code: event.code }),
    provider: ROUTER_PROVIDER_ID,
    reason: redactSecrets(event.message, apiKey),
  };
  const code =
    event.code === RATE_LIMIT_CODE ? "rate_limited" : "provider_error";
  return new AuteurError(code, MESSAGE_BY_CODE[code], { detail });
};

/**
 * Translate anything thrown while streaming into an `AuteurError`.
 *
 * An `AuteurError` passes through untouched: the adapter raises its own for a
 * malformed stream, and re-wrapping would lose the code it already chose.
 */
export const asAuteurError = (
  thrown: unknown,
  apiKey?: string,
): AuteurError => {
  if (thrown instanceof AuteurError) return thrown;
  // An abort is what the caller asked for, not a gateway failure. The SDK
  // raises it from the same place as everything else, so it is classified here
  // rather than at each call site that could have aborted.
  if (isAbort(thrown)) {
    return new AuteurError("cancelled", MESSAGE_BY_CODE.cancelled);
  }
  if (thrown instanceof APIError) {
    const detail = detailOf(thrown, apiKey);
    const code =
      thrown.status === TOO_MANY_REQUESTS || isRateLimitBody(thrown)
        ? "rate_limited"
        : thrown.status === NOT_FOUND
          ? "model_unavailable"
          : "provider_error";
    return new AuteurError(code, MESSAGE_BY_CODE[code], { detail });
  }
  return new AuteurError("provider_error", MESSAGE_BY_CODE.provider_error, {
    cause: thrown,
    detail: {
      provider: ROUTER_PROVIDER_ID,
      reason: redactSecrets(
        thrown instanceof Error ? thrown.message : "unknown failure",
        apiKey,
      ),
    },
  });
};
