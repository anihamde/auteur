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

   **Leave every Override toggle in Framework Settings off** — Build Command,
   Output Directory, Install Command. `vercel.json` says what those are, and a
   project-level Output Directory is the worst of them: the build produces
   `.vercel/output`, the platform then looks for the directory the setting
   names, does not find it, and fails the deployment **after** a clean build
   with an empty error panel.

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
7. **Import the catalogue**, from any machine with egress, pointed at the
   deployment's database:

   ```
   DATABASE_URL='<the unpooled Neon url>' bun run catalogue:import
   ```

   Author search and `corpus-select` both read `authors` and `catalogue_works`,
   and both are empty until this runs — search finds nobody and a session that
   somehow named an author fails with `corpus_unavailable`. It downloads
   Project Gutenberg's published CSV, keeps the English texts, and upserts
   around 32,000 authors and 86,000 works. It never touches `measured_words`,
   so re-running it refreshes names and counts without discarding a measured
   corpus.

   **It runs from anywhere, not from the deployment** — that is the point.
   `gutendex.com` answers a serverless function with Cloudflare's managed
   challenge (decision 0023), so the index is imported once from a network that
   is not challenged and read locally afterwards. The text host,
   `gutenberg.org`, answers the deployment normally and is still fetched at run
   time.

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
3. `bun run verify:live` — the checks that need real credentials, from a
   machine with egress. Two of them run: the Gutendex response schema against
   a live response, and `LISTEN`/`NOTIFY` on Neon's direct endpoint. Two do
   not, and say so rather than passing: the gateway probe's measurement half
   is unwritten, and the latinate classifier's labelled set does not exist.

   A failing run naming an unwritten check is the honest state. A run that
   reported four passes would mean nothing ran — which is what it did until
   `unchecked` existed.
4. `GET /api/authors?q=chekhov` returns rows. An empty `results` with a 200 is
   the catalogue import not having run against this database, not a search
   defect — `SELECT count(*) FROM catalogue_works` says which.
5. One flash story, end to end, in the browser.
6. Kill a stage mid-run and confirm the sweep re-invokes it. That is the only
   check that exercises the recovery path rather than the happy one.
7. `bun run stats` and `bun run discrimination`, and fill in
   `docs/BASELINE.md`.
