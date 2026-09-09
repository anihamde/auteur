# Deploying

One Vercel project serves the client and the routes; one Neon database holds
everything. There is no second origin and no release phase — the schema comes
up to date on the first request, under `ensureSchema`'s lock.

## Environment

Seven variables. Six are read by the server at runtime; the seventh is inlined
into the client bundle when it is built.

| name | scope | what it is |
| --- | --- | --- |
| `AUTEUR_API_TOKEN` | Production + Preview | Bearer token every public route requires. |
| `AUTEUR_STAGE_SECRET` | Production + Preview | Signs `POST /api/internal/stage`. Distinct from the API token so a browser holding the client's token cannot drive the pipeline directly. |
| `CRON_SECRET` | Production | What the scheduler presents on the sweep. **The name is Vercel's** — it attaches `Authorization: Bearer …` only when a variable of exactly this name exists. |
| `RAMP_ROUTER_API_KEY` | Production + Preview | Credential for every model call. |
| `DATABASE_URL` | Production + Preview | Neon's **pooled** endpoint. Its host contains `-pooler`. |
| `DATABASE_URL_DIRECT` | Production + Preview | Neon's **unpooled** endpoint. |
| `VITE_API_TOKEN` | Production + Preview | The same value as `AUTEUR_API_TOKEN`, for the client. |

The two database URLs are not interchangeable. Every route but one uses the
pooled endpoint, because function instances are plural and short-lived; the SSE
route uses the direct one, because `LISTEN` is a session-level feature and a
pooled `LISTEN` is accepted and then never delivers anything.

`VITE_API_TOKEN` is inlined **at build time**. Adding it to a deployment that
already exists does nothing until the next build, and `bun run preflight`
cannot check it — that reads the server's environment, and this one is baked
into the bundle. The client refuses to start without it rather than sending an
empty `Authorization` header, which would render every screen and 401 every
action.

`VITE_API_BASE` stays unset: unset means same origin, which is the deploy.
`VITE_DEMO=1` builds the client against a recorded log with no server at all.

## Steps

1. **New Project**, pointed at this repository. Set **Root Directory** to
   `apps/auteur-web`, **Framework Preset** to **Other**, and turn on **Include
   files outside of the Root Directory** — the build needs `packages/` and the
   workspace lockfile.

   The root directory is the app, not the repository, and the reason is
   resolution: workspace packages are linked into the `node_modules` of the
   package that depends on them, never into the repository root. A function at
   the repository root cannot resolve `@auteur/*` at all, and fails during
   import with a module-resolution error before any route exists.

   `apps/auteur-web/vercel.json` holds the configuration; its build and install
   commands step up to the workspace root, so the whole monorepo is installed
   and built while the deployment root stays this app.

   The build produces `.vercel/output` itself — the client bundle and one
   bundled function — rather than leaving the platform to compile the routes
   and resolve the rest at runtime. Our workspace packages export TypeScript
   source, which Node cannot import; `bun run build:vercel` bundles all of it
   into a single file. `bundle.test.ts` runs that file under Node against an
   empty database, which is the only check here that answers "would the deploy
   work".

   The routes live in `apps/auteur-web/server/`, not `api/`. A directory called
   `api/` makes the platform build every file in it as a function *as well*,
   with its own TypeScript configuration — two minutes of type errors and a
   function nobody asked for, beside the one we bundled.
2. Add the five variables above that do not come from Neon.
3. **Deploy.** The build succeeds and the functions fail — there is no database
   yet. That is expected.
4. **Storage → Marketplace → Neon**, and create the database.
5. Map Neon's two connection strings onto `DATABASE_URL` (pooled, host contains
   `-pooler`) and `DATABASE_URL_DIRECT` (unpooled). If the integration injected
   its own variable names, map rather than rename — the app reads only these
   two.
6. **Redeploy.** The schema migrates on the first request.

## Verifying

1. `GET /api/health` answers 200.

   A **404** means the output carries no function for that path: check the
   Root Directory is `apps/auteur-web` and that the build log ends with
   `built .vercel/output`.

   A **500** naming missing variables is the environment; the response lists
   every key to fix. A **500** that is the platform's own crash page is a throw
   during import, and the reason is in the function's log.

   A deployment that fails **after** `Build Completed`, with an empty error
   panel and nothing in the log after `Deploying outputs`, is the output being
   rejected — the build is not what failed, so the build log will never say so.
   The generated `.vc-config.json` is where to look; `maxDuration` above the
   plan's ceiling fails exactly this way.
2. `bun run preflight` locally, with the same values in `.env`. It names every
   missing or malformed variable at once rather than the first.
3. `bun run verify:live` — the four checks that need real credentials: the
   model catalogue against the gateway, the Gutendex response schema, the
   latinate classifier's precision, and `LISTEN`/`NOTIFY` on Neon's direct
   endpoint. It fails on any discrepancy rather than absorbing it.
4. One flash story, end to end, in the browser.
5. Kill a stage mid-run and confirm the sweep re-invokes it. That is the only
   check that exercises the recovery path rather than the happy one.
6. `bun run stats` and `bun run discrimination`, and fill in
   `docs/BASELINE.md`.
