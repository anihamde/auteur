/**
 * Where the client sends its requests.
 *
 * `VITE_API_BASE` unset means **same origin**, which is the deploy: the client
 * and the routes are one Vercel project, so there is no second origin and
 * therefore no CORS. Set, every request goes to that origin — which is what a
 * local client pointed at a preview deployment needs.
 *
 * There is no hardcoded host anywhere in the client, and a test asserts it: a
 * fallback URL is the kind of thing that works for whoever wrote it and for
 * nobody else.
 */
export const apiBase = (
  env: Readonly<Record<string, string | undefined>> = import.meta.env,
): string => {
  const configured = env["VITE_API_BASE"];
  return configured === undefined || configured === "" ? "" : configured;
};

/**
 * Whether the client should run from a recorded log instead of the network.
 *
 * `VITE_DEMO=1`. Demo mode issues **zero** requests — not "requests that fail
 * gracefully" — because the point is a client someone can open with no server,
 * and a failed request is a spinner that never resolves.
 */
export const isDemo = (
  env: Readonly<Record<string, string | undefined>> = import.meta.env,
): boolean => env["VITE_DEMO"] === "1";
