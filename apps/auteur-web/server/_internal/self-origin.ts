/**
 * The origin a stage invocation is addressed to.
 *
 * A stage runs by the deployment asking itself, over HTTP, to run it (§7.1) —
 * so this string is the difference between a pipeline that runs and a queue
 * that fills.
 *
 * **It is the production alias, not the per-deployment host.** Deployment
 * Protection's standard mode puts an authentication wall in front of the
 * generated `VERCEL_URL` hostname and leaves the project's production domain
 * open, which is why the deployment could serve the browser and not itself:
 * every invocation answered 401 from a login page it was never going to get
 * past. Sending a bypass secret works and is still done below for previews,
 * but it makes a running pipeline depend on a secret being present in the
 * environment — a condition nothing checks and whose absence looks exactly
 * like a slow pipeline. Addressing the host that has no wall does not.
 *
 * A preview still addresses itself: `VERCEL_URL` there is the preview's own
 * host, and a preview driving production's pipeline would write production's
 * rows from unreviewed code.
 */

export type EnvRecord = Readonly<Record<string, string | undefined>>;

/** Unset and empty are the same thing here: `https://` with no host parses and reaches nothing. */
const value = (env: EnvRecord, name: string): string | undefined => {
  const found = env[name];
  return found === undefined || found === "" ? undefined : found;
};

export const selfOriginFrom = (env: EnvRecord): string => {
  const environment = value(env, "VERCEL_ENV");
  // The override exists for a deployment whose production domain is not the
  // one the platform reports — a custom domain in front of it, say. Whole
  // origin rather than a host, because someone setting this has a URL.
  //
  // **A preview ignores it**, for the same reason a preview does not take the
  // alias. The variable form on the platform selects all three environments by
  // default, so the ordinary way to add this is the way that would point every
  // preview at production — and the failure is silent in both directions:
  // against a shared database production claims the preview's row and runs its
  // own build of the stage, so the change under review never executes and the
  // preview looks like it works; against a separate one `claimStage` finds no
  // row and answers `200 {claimed: false}`, which is a 2xx, so not even the
  // refusal logging fires.
  const configured = value(env, "AUTEUR_SELF_ORIGIN");
  if (configured !== undefined && environment !== "preview") {
    return configured;
  }
  const production = value(env, "VERCEL_PROJECT_PRODUCTION_URL");
  if (environment === "production" && production !== undefined) {
    return `https://${production}`;
  }
  const host = value(env, "VERCEL_URL");
  // No `VERCEL_URL` at all is a local `vite dev`.
  return host === undefined ? "http://127.0.0.1:3000" : `https://${host}`;
};
