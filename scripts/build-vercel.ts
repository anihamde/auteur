#!/usr/bin/env bun
/**
 * `bun run build:vercel` — produce the deployment, rather than describe it.
 *
 * The platform's zero-configuration builder compiles `api/*.ts` and leaves
 * every bare specifier to be resolved at runtime by Node. Our workspace
 * packages export **TypeScript source** — `@auteur/api-contract` resolves to
 * `src/contract.ts` — so the compiled function asks Node to import a `.ts`
 * file from a symlinked workspace package, and Node answers
 * `ERR_MODULE_NOT_FOUND`. That is not a misconfiguration to find the right
 * setting for: source-exporting packages and a builder that treats
 * `node_modules` as already-built JavaScript cannot both be right.
 *
 * Which is why the source lives in `server/` and not `api/`. A directory
 * called `api/` is the platform's own trigger: it builds every file there as a
 * function *in addition* to whatever the build command produced, with its own
 * TypeScript configuration and its own idea of how to resolve an import. It
 * did, and it spent two minutes reporting that `node:crypto` does not exist
 * before deploying something nobody asked it to build.
 *
 * So the build emits the Build Output API directly:
 *
 *   .vercel/output/
 *     config.json                      routes, crons
 *     static/**                        the client bundle, verbatim
 *     functions/api/[...path].func/    one bundled function
 *
 * Everything the function needs is bundled into a single file, which is what
 * makes it verifiable: `bun run build:vercel` then importing that file under
 * Node is the whole of what the deployment does at cold start, and it either
 * loads here or it fails here.
 *
 * `vercel.json` stays the source of the schedule and the duration — this reads
 * them rather than restating them.
 */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const APP = join(ROOT, "apps/auteur-web");
const OUT = join(APP, ".vercel/output");

/**
 * The one function, named as the path it answers.
 *
 * The name is the platform's catch-all form and the `routes` below are what
 * point at it: a dynamic name is not matched by its own spelling.
 */
const CATCH_ALL = "[...path]";
export const FUNCTION_DIR = `functions/api/${CATCH_ALL}.func`;

type VercelJson = {
  readonly crons?: readonly {
    readonly path: string;
    readonly schedule: string;
  }[];
};

/**
 * How long one invocation may run.
 *
 * **60, because that is the ceiling on this plan.** A `.vc-config.json` asking
 * for more is rejected when the output is uploaded — after a clean build, with
 * no message in the build log, because the build is not what failed. That is
 * the same limit that rejected the every-minute cron, and it is the only value
 * in the generated configuration a plan can refuse.
 *
 * It bounds one stage, not a run: the chain's whole design is that no
 * invocation waits for another, so a stage that needs longer than a minute is
 * a stage to split rather than a limit to raise. Raise it here if the plan
 * changes.
 */
export const MAX_DURATION = 60;

/**
 * The launcher the bundled function exports.
 *
 * Hono speaks the Web `Request`/`Response` pair; the platform's Node runtime
 * hands a handler `(req, res)`. `@hono/node-server`'s listener is the adapter,
 * and it is the one that streams — which the events route needs, since an SSE
 * response is a body that never ends.
 */
const ENTRY = `import { getRequestListener } from "@hono/node-server";
import handler from "./server/entry.ts";

export default getRequestListener(handler);
`;

/**
 * The function's configuration, shaped like one the platform generates itself.
 *
 * The field set is taken from what `vercel build` emits for an ordinary Node
 * function, plus the two this one needs: `maxDuration`, and
 * `supportsResponseStreaming` — the events route is an SSE body that never
 * ends, and a buffered response would deliver the stream when the run is over.
 *
 * `shouldAddHelpers` is false because the handler is a Node request listener
 * already; the helpers exist to give a bare handler `req.body` and friends,
 * which `@hono/node-server` does not want and would read the body ahead of.
 */
export const vcConfig = (maxDuration: number): string =>
  `${JSON.stringify(
    {
      architecture: "x86_64",
      awsLambdaHandler: "",
      environment: {},
      handler: "index.mjs",
      launcherType: "Nodejs",
      maxDuration,
      runtime: "nodejs22.x",
      shouldAddHelpers: false,
      shouldAddSourcemapSupport: false,
      shouldDisableAutomaticFetchInstrumentation: false,
      supportsResponseStreaming: true,
    },
    null,
    2,
  )}\n`;

/**
 * How a URL reaches the function, and how everything else reaches a file.
 *
 * A `.func` directory whose name carries a dynamic segment is not matched by
 * its name alone — the output has to say which URLs go to it, the way a
 * framework's own generated output does. Without this the deployment contains
 * a function nothing can reach, and the schedule names a path that resolves to
 * nothing, which the platform rejects at deploy time: a clean build and a
 * failed deployment with no message under it.
 *
 * The order is the whole of the behaviour. `/api/*` is claimed **before**
 * `filesystem`, so no static file can shadow a route. `filesystem` then serves
 * the client bundle. What is left is a path the client owns, and it gets
 * `index.html` — a single-page app has one document, and a deep link that
 * 404s is the platform disagreeing with that.
 */
const ROUTES = [
  { dest: `/api/${CATCH_ALL}`, src: "^/api(?:/.*)?$" },
  { handle: "filesystem" },
  { dest: "/index.html", src: "/.*" },
];

export const outputConfig = (source: VercelJson): string =>
  `${JSON.stringify(
    {
      ...(source.crons === undefined ? {} : { crons: source.crons }),
      routes: ROUTES,
      version: 3,
    },
    null,
    2,
  )}\n`;

/**
 * The function, as one file with everything in it.
 *
 * Exported so a test can build it and run it under Node — which is the only
 * check that covers what the deployment actually does: bundle, load, migrate,
 * answer. Every other suite here runs under Bun against source.
 */
export const bundleFunction = async (): Promise<string> => {
  // Written inside the app rather than at the repository root: workspace
  // packages are linked into the `node_modules` of the package that depends on
  // them, so a file at the root resolves neither `@hono/node-server` nor
  // `@auteur/*`. This is the same fact decision 0015 turned on.
  const entryPath = join(APP, ".auteur-vercel-entry.mjs");
  await writeFile(entryPath, ENTRY);
  try {
    const built = await Bun.build({
      entrypoints: [entryPath],
      format: "esm",
      minify: false,
      target: "node",
    });
    if (!built.success) {
      throw new Error(
        `The function did not bundle:\n${built.logs.map((log) => String(log)).join("\n")}`,
      );
    }
    const [artifact] = built.outputs;
    if (artifact === undefined) {
      throw new Error("The bundle produced no output.");
    }
    return await artifact.text();
  } finally {
    await rm(entryPath, { force: true });
  }
};

if (import.meta.main) {
  const config = (await Bun.file(
    join(APP, "vercel.json"),
  ).json()) as VercelJson;

  await rm(OUT, { force: true, recursive: true });
  await mkdir(join(OUT, FUNCTION_DIR), { recursive: true });

  // The client, exactly as `vite build` left it.
  await cp(join(APP, "dist"), join(OUT, "static"), { recursive: true });

  const bundled = await bundleFunction();
  await writeFile(join(OUT, FUNCTION_DIR, "index.mjs"), bundled);
  await writeFile(
    join(OUT, FUNCTION_DIR, ".vc-config.json"),
    vcConfig(MAX_DURATION),
  );
  await writeFile(join(OUT, "config.json"), outputConfig(config));

  const bytes = bundled.length;
  process.stdout.write(
    `built .vercel/output: 1 function (${Math.round(bytes / 1024).toString()} KB bundled), ` +
      `static from apps/auteur-web/dist\n`,
  );
}
