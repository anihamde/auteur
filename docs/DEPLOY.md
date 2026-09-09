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
| `AUTEUR_STAGE_SECRET` | Production + Preview | Signs `POST /internal/stage`. Distinct from the API token so a browser holding the client's token cannot drive the pipeline directly. |
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

1. **New Project**, pointed at this repository. Set **Root Directory** to `./`
   and **Framework Preset** to **Other**. `vercel.json` is at the repository
   root and its paths are root-relative; a root directory inside the monorepo
   makes the platform read a configuration that is not there.
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

1. `GET /api/health` answers 200. A 404 means no function was built: the
   platform creates one per file in `api/` at the root of the deployment, which
   is what `api/[[...path]].ts` is for.
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
