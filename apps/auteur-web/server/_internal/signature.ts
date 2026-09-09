import { createHmac, timingSafeEqual } from "node:crypto";
import { AuteurError } from "@auteur/errors/auteur-error";

/**
 * The signature on `POST /internal/stage`.
 *
 * HMAC-SHA256 over the **raw body**, with a secret distinct from the API token
 * so a browser holding the client's token cannot drive the pipeline directly.
 *
 * This is not authentication and must not be called that: it identifies no one.
 * It says "this request came from something holding the stage secret", which is
 * the whole claim, and naming it authentication invites a permission model on
 * top of a value that carries no principal.
 *
 * The raw bytes, not the parsed body: a signature over a re-serialized object
 * verifies a different string than the one that was signed the moment key order
 * or number formatting differs.
 */
export const SIGNATURE_HEADER = "x-auteur-signature";

export const signPayload = (secret: string, raw: string): string =>
  createHmac("sha256", secret).update(raw).digest("hex");

/**
 * Verify, or throw `unauthorized`.
 *
 * Constant-time, and identical for a missing signature and a wrong one: the
 * difference is information about the secret.
 */
export const requireSignature = (
  secret: string,
  raw: string,
  presented: string | undefined,
): void => {
  const expected = signPayload(secret, raw);
  if (presented === undefined || !constantTimeEqual(presented, expected)) {
    throw new AuteurError(
      "unauthorized",
      "This request is not signed for the pipeline.",
    );
  }
};

/**
 * `timingSafeEqual`, which throws on a length mismatch rather than answering.
 *
 * Both sides here are hex digests of a fixed width, so a difference in length
 * means the presented value is not a signature at all — which is a refusal,
 * not a comparison.
 */
const constantTimeEqual = (left: string, right: string): boolean => {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
};
