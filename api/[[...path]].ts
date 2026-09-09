/**
 * Where the platform looks for functions.
 *
 * Vercel creates a function for each file in the `api/` directory **at the
 * root of the deployment**, and `vercel.json` — which is at the repository
 * root, with root-relative paths — makes that root the repository. The
 * application's own entry point is `apps/auteur-web/api/[[...path]].ts`, which
 * is where it belongs: beside the app it serves, inside the package whose
 * tsconfig and tests cover it.
 *
 * So this file exists to be found. It holds no logic, and adding any here
 * would put request handling in the one module no package tests.
 *
 * The `functions` glob in `vercel.json` names this directory, and
 * `deploy-readiness.test.ts` checks that the glob and this file agree — a
 * mismatch is a deployment that builds, serves the static site, and answers
 * 404 to every route including `/api/health`.
 */
import handler, {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "../apps/auteur-web/api/[[...path]].ts";

export { DELETE, GET, PATCH, POST, PUT };
export default handler;
