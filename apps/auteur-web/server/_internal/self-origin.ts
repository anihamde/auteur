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
  // The override exists for a deployment whose production domain is not the
  // one the platform reports — a custom domain in front of it, say. Whole
  // origin rather than a host, because someone setting this has a URL.
  const configured = value(env, "AUTEUR_SELF_ORIGIN");
  if (configured !== undefined) {
    return configured;
  }
  const production = value(env, "VERCEL_PROJECT_PRODUCTION_URL");
  if (value(env, "VERCEL_ENV") === "production" && production !== undefined) {
    return `https://${production}`;
  }
  const host = value(env, "VERCEL_URL");
  // No `VERCEL_URL` at all is a local `vite dev`.
  return host === undefined ? "http://127.0.0.1:3000" : `https://${host}`;
};
