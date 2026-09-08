---
id: deployment
title: Deployment
covers: Vercel by default, Fly.io for long-running work, and the split between them
tier: if-touched
trigger: "You change deployment configuration, add a background job, or add a service."
---

# Deployment

## Vercel is the default

The web application deploys to Vercel. Preview deployments per pull request,
production on the default branch.

Design for the serverless model:

- **A request handler is short-lived.** It may be frozen or killed the moment
  it responds. Nothing continues after the response.
- **No in-process state between requests.** No in-memory cache you rely on, no
  module-level mutable accumulator, no background timer. Instances are
  ephemeral and plural.
- **No local filesystem writes** beyond a scratch temp file within one request.
- **Connections are pooled**, because instances multiply — see
  [database](./database.md).
- Configuration comes from environment variables, set per environment in the
  platform, read through the one validated accessor — see
  [security](./security.md).

## Fly.io for long-running work

When work does not fit a request lifetime, it goes to a Fly.io service, not
into a stretched serverless timeout. Reach for it when the work is:

- longer than a request's ceiling — video processing, large imports, model runs;
- a persistent connection — a WebSocket server, a subscriber;
- a scheduled or queued worker that must retry with its own backoff;
- stateful in a way serverless forbids.

Shape of that split:

- The web app enqueues a job and returns immediately. It never blocks on the
  worker.
- The queue is durable — Postgres is an acceptable queue at small scale — so a
  crashed worker loses nothing.
- Every job is idempotent; it will be retried.
- The worker reports progress and terminal state to a place the web app reads,
  so the UI can show status without polling the worker.
- The worker is a package in the same repo, sharing types and schemas with the
  app — see [monorepo](./monorepo.md).

Do not add a third platform without a design doc.

## Deploy discipline

- The default branch is always deployable. Nothing merges red.
- Roll forward. A revert is a normal commit that goes through the same pipeline.
- A change that needs a schema change ships in the expand/migrate/contract
  order — see [migrations](./migrations.md). The deploy never assumes the old
  version has stopped running.
- Use a flag for anything you cannot roll back cleanly, and remove the flag
  once the change is settled.

## Observability

Every environment has structured logs with a request or job correlation id,
error reporting that alerts, and enough latency and error-rate signal to tell
whether a deploy made things worse. Ship this with the first deploy, not after
the first incident.
