import { type ErrorCode, STATUS_BY_CODE } from "./error-code.ts";
import { isAuteurError } from "./is-auteur-error.ts";

export type ErrorBody = {
  readonly error: { readonly code: ErrorCode; readonly message: string };
};

/**
 * The one mapping from a thrown value to an HTTP response.
 *
 * **It refuses to forward the message of anything that is not an
 * `AuteurError`.** That is the rule worth stating: an unexpected throw is the
 * one case whose message was not written with a reader in mind, and it can
 * carry a provider's raw response, a connection string, or a stack. So an
 * unrecognised value becomes `internal` with a fixed message, and the real one
 * goes to the log instead.
 *
 * `docs/ARCHITECTURE.md` §7.4, and the `http-api` guideline's one-error-shape
 * rule: never a 200 carrying an error, and `code` is the stable string a client
 * may branch on.
 */
export const toHttpResponse = (
  thrown: unknown,
): { readonly status: number; readonly body: ErrorBody } => {
  if (isAuteurError(thrown)) {
    return {
      body: { error: { code: thrown.code, message: thrown.message } },
      status: STATUS_BY_CODE[thrown.code],
    };
  }
  return {
    body: {
      error: {
        code: "internal",
        message: "Something failed unexpectedly.",
      },
    },
    status: STATUS_BY_CODE.internal,
  };
};
