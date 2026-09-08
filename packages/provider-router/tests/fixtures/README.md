# Synthesised, not recorded

Every `*.sse` file here is **synthesised against the OpenAI Responses event
grammar**, not captured from `api.router.com`. The build environment has no
gateway credential and no egress to it (`docs/IMPLEMENTATION-PLAN.md` §4), so
these are what a correct stream is believed to look like rather than what one
was observed to be.

WP-X0's verification pass records real transcripts and replaces them. Until it
does, a test passing here means this package agrees with the grammar — which is
worth having, and is not the same as agreeing with the gateway.

The bytes are replayed through a real `OpenAI` client with an injected `fetch`,
so the SDK's own SSE decoder, error classification and abort handling are all
exercised. A fake that skipped the SDK would only prove this package agrees
with itself.
