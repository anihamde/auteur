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
 * So this renders a **bounded projection** of the two shapes a detail comes in.
 *
 * A provider failure carries a `reason`: the gateway's own code, its status,
 * and its sentence truncated — the shape `provider-errors.ts` builds, already
 * passed through `redactSecrets`.
 *
 * A schema violation carries `issues`: zod's own findings, rendered as the
 * first few `path: message` pairs. Not the whole tree — that is a paragraph of
 * JSON paths — but "exemplars: array must contain at least 8 element(s)" is the
 * entire diagnosis of a stage that otherwise says only that the model returned
 * the wrong shape, and reading it should not require the platform's log viewer.
 * The text is zod's and the paths are this repository's own field names, so
 * neither is somebody else's prose.
 *
 * A detail carrying neither produces no line at all.
 */

/** How much of a provider's own sentence survives. Long enough to name a cause. */
const MAX_REASON = 240;

/** How many findings are named before the count stands in for the rest. */
const MAX_ISSUES = 3;

type Issue = { readonly path?: unknown; readonly message?: unknown };

const pathOf = (issue: Issue): string =>
  Array.isArray(issue.path) && issue.path.length > 0
    ? issue.path.map((step) => String(step)).join(".")
    : "(root)";

/**
 * Zod's findings as one line.
 *
 * The first few only: a model that returns the wrong shape usually returns it
 * wrongly in one way repeated, and forty identical paths are no more diagnostic
 * than three.
 */
const issuesLine = (issues: unknown): string | undefined => {
  if (!Array.isArray(issues) || issues.length === 0) {
    return undefined;
  }
  const named = issues
    .slice(0, MAX_ISSUES)
    .map((issue: Issue) =>
      typeof issue?.message === "string"
        ? `${pathOf(issue)}: ${issue.message}`
        : pathOf(issue),
    )
    .join("; ");
  const rest = issues.length - MAX_ISSUES;
  return rest > 0 ? `${named} (+${rest.toString()} more)` : named;
};

export const detailLine = (error: AuteurError): string | undefined => {
  const detail = error.detail;
  if (detail === undefined) {
    return undefined;
  }
  const reason = detail["reason"];
  if (typeof reason !== "string" || reason === "") {
    return issuesLine(detail["issues"]);
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
