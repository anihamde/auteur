---
id: security
title: Security
covers: Secrets, untrusted input, authorization checks, and dependency risk
tier: if-touched
trigger: "You handle secrets, user input, authentication, authorization, or outbound requests."
---

# Security

## Secrets

- Secrets live in environment variables, injected by the platform. Never in
  source, never in a committed file, never in a client bundle.
- Read every secret through one typed accessor module that validates presence
  at startup and throws if it is missing. A missing secret must fail the boot,
  not the first request that needs it.
- Never log a secret, a token, a session cookie, or a full request header set.
  When you must log an identifier, log a prefix or a hash.
- A secret that reaches a branch, a log, or an error message is compromised.
  Rotate it. Removing the commit is not sufficient.

## Untrusted input

Everything crossing a boundary is untrusted: request bodies, query params, path
params, headers, cookies, webhook payloads, third-party API responses, and
anything read back from storage that a user could have influenced.

Parse it at the boundary with a schema — see
[data-boundaries](./data-boundaries.md). A type assertion is not validation.

## SQL

Every value interpolated into a query goes through a parameterized placeholder.
String-concatenating a value into SQL is a defect, no matter where the value
came from. See [database](./database.md).

## Authorization is checked per request, at the data layer

- Never trust a client-supplied user id, org id, or role. Derive identity from
  the session on every request.
- Scope every query by the authenticated principal. A handler that fetches by
  id and then compares ownership in application code will eventually miss a
  path; put the scope in the `WHERE` clause.
- Authorization runs on the server. A hidden button is not an access control.

## Output

- Never build HTML by string concatenation from user data. Let the framework
  escape it.
- Do not reflect an internal error message, stack trace, or SQL fragment to a
  client. Log the detail server-side with a correlation id; return a generic
  message and that id.
- Set the framework's security headers, and keep cookies `HttpOnly`, `Secure`,
  and `SameSite=Lax` or stricter.

## Dependencies

- Do not add a runtime dependency without confirming the intent; each one is
  code you ship and must trust.
- Prefer the platform or standard library over a package for anything small.
- Keep dependency audit and update checks running in CI, and treat a
  vulnerability finding on a dependency you actually use as a fix now, not a
  backlog item.
