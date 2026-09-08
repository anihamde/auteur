---
id: http-hono
title: HTTP — Hono, and the two steps that do not exist here
covers: The request pipeline for a single-user application
tier: if-touched
trigger: "You add or modify an HTTP endpoint."
overrides: [http-api]
---

# HTTP — Hono, and the two steps that do not exist here

The seeded `http-api` guideline gives a five-step request pipeline. auteur is
single-user: there are no accounts, no sessions and no protected routes, so
**steps 1 and 2 — authenticate, then authorize — do not exist**. There is
nothing to authenticate and no principal to authorize.

The remaining three stand verbatim, and they are the ones that carry the weight:

**3. Parse before doing any work.** Every request body and every query parameter
goes through a zod schema at the top of the handler. Not "validate what looks
risky" — parse, so that everything below the parse is typed and nothing below it
is a guess. This is invariant 4 applied to the other direction of the wire.

**4. A status code means what happened.** `@auteur/errors` holds the closed
taxonomy and `toHttpResponse` maps it exhaustively, which is what makes this a
property rather than a convention: adding a code means deciding what status it
means, because the map does not compile otherwise.

None of nexus's status-as-security-property reasoning applies here, because a
404 hides nothing a 403 would reveal when there is one user. So the mapping is
the ordinary one.

**5. One error shape, and never a 200 carrying an error.** `{ error: { code,
message } }`, always. A 200 with a failure in the body is the shape that makes
every client's error handling optional, and optional error handling is absent
error handling.

## What replaces authorization: the stage secret

The one thing steps 1 and 2 did that still needs doing is keeping the outside
world from invoking a stage function directly. That is a shared secret on the
internal routes (`AUTEUR_STAGE_SECRET`), checked before anything else. It is not
authentication — it identifies no one — and calling it that would invite someone
to build a permission model on top of it.
