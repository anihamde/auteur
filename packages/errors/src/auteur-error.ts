import type { ErrorCode } from "./error-code.ts";

/**
 * The only error type `packages/` throws.
 *
 * `AGENTS.md` will require it: no bare `throw new Error`, no silent catch, no
 * swallowed failure. The point is not ceremony — it is that every failure
 * carries a code a caller can branch on and a message written for a reader,
 * and that anything *without* those two is by construction unexpected and gets
 * treated as such by `toHttpResponse`.
 */
export class AuteurError extends Error {
  readonly code: ErrorCode;
  /**
   * Structured detail for a log line. Never rendered to a user and never sent
   * over HTTP: it is where a provider's raw response or a failing field path
   * goes, and neither is written with a reader in mind.
   */
  readonly detail: Readonly<Record<string, unknown>> | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      readonly cause?: unknown;
      readonly detail?: Readonly<Record<string, unknown>>;
    },
  ) {
    super(
      message,
      options?.cause === undefined ? {} : { cause: options.cause },
    );
    this.name = "AuteurError";
    this.code = code;
    this.detail = options?.detail;
  }
}
