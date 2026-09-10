import type { AuteurError } from "./auteur-error.ts";

/**
 * The one sentence of an error's `detail` a reader is allowed to see.
 *
 * `AuteurError.detail` is for a log line and nothing else: it holds raw
 * provider bodies and zod issue trees, neither written with a reader in mind.
 * But "The model gateway failed." is not a diagnosis either — a stage that has
 * failed four times for four different reasons says exactly that sentence each
 * time, and finding out which one meant `context_length_exceeded` costs a trip
 * through the platform's log viewer.
 *
 * So this renders a **bounded projection**: the gateway's own code, its status,
 * and its sentence truncated. Nothing else, and nothing at all unless `detail`
 * carries a `reason` — which is the shape `provider-errors.ts` builds and has
 * already passed through `redactSecrets`. A `schema_violation`'s issue array
 * has no `reason` and produces no line, rather than a paragraph of zod paths on
 * somebody's screen.
 */

/** How much of a provider's own sentence survives. Long enough to name a cause. */
const MAX_REASON = 240;

export const detailLine = (error: AuteurError): string | undefined => {
  const detail = error.detail;
  if (detail === undefined) {
    return undefined;
  }
  const reason = detail["reason"];
  if (typeof reason !== "string" || reason === "") {
    return undefined;
  }
  const code = detail["code"];
  const status = detail["status"];
  // The gateway's finer label first: `insufficient_quota` and
  // `context_length_exceeded` are both 400s and want different responses.
  const label = [
    typeof code === "string" && code !== "" ? code : undefined,
    typeof status === "number" ? `HTTP ${status.toString()}` : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(" ");
  const trimmed =
    reason.length > MAX_REASON ? `${reason.slice(0, MAX_REASON)}…` : reason;
  return label === "" ? trimmed : `${label}: ${trimmed}`;
};
