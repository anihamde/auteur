---
id: http-api
title: HTTP APIs
covers: Route handlers, status codes, error shapes, idempotency, and webhooks
tier: if-touched
trigger: "You add or modify an HTTP endpoint, or a webhook receiver."
---

# HTTP APIs

An HTTP endpoint exists for consumers that are not this application: webhooks,
third-party callbacks, public APIs, other services. Do not build one for your
own UI to call when a server component or a server action can query directly —
see [nextjs](./nextjs.md).

## Every handler, in order

1. **Authenticate**, from the session or a verified signature. Never from a
   body field.
2. **Authorize** for this specific resource.
3. **Parse** path params, query, and body with a schema — see
   [data-boundaries](./data-boundaries.md).
4. **Do the work**, in a transaction if it is a multi-statement write.
5. **Return** a typed, versioned response.

None of these steps is skippable because "the UI already checks".

## Status codes and error shape

Use the codes that mean what happened: 400 malformed, 401 unauthenticated, 403
unauthorized, 404 missing, 409 conflict, 422 semantically invalid, 429 rate
limited, 5xx our fault. A 200 carrying `{ "error": ... }` is a defect — it
breaks every client's retry and monitoring.

One error shape across every endpoint:

```jsonc
{ "error": { "code": "invalid_email", "message": "…", "requestId": "…" } }
```

`code` is a stable machine-readable string clients may branch on. `message` is
for a human reading a log. Never leak a stack trace, a SQL fragment, or an
internal path — log the detail server-side against `requestId`.

## Idempotency

Any endpoint a client may retry — every webhook receiver, every payment or
provisioning call — must be safe to call twice. Key the operation on a natural
id or a client-supplied idempotency key, and make the write conflict-safe. See
[database](./database.md).

## Webhooks

- **Verify the signature before parsing the body**, using the raw bytes. A
  framework that pre-parses the body will break verification.
- Reject stale timestamps to prevent replay.
- Acknowledge fast: validate, persist the event, return 2xx, and do the work
  after. A slow handler causes the sender to retry, which is why the handler
  must be idempotent.
- Expect out-of-order and duplicate deliveries. Neither is an error.

## Versioning and limits

- Treat every response shape as a contract with an independently-deployed
  consumer: additive changes by default, and a versioned envelope for a real
  break. See [data-boundaries](./data-boundaries.md).
- Rate-limit every public endpoint, especially anything that sends email or
  costs money per call.
- Bound the request body size and set a timeout; an unbounded handler is a
  denial-of-service surface.
