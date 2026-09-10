# Reduced, and named so

`gateway-models.reduced.json` carries the gateway's **own values** — every id,
context window, output ceiling, structured-output flag, status and price is what
`GET /v1/models` answered on 2026-09-10 — in an envelope reduced to the fields
this code reads.

The distinction matters, which is why the name says it. A `.recorded.` file
would claim the schema has been proved against the shape the gateway actually
sends, and it has not: the live `router` block also carries modalities,
reasoning efforts, verbosity, descriptions and listing order, and this file has
none of them. What the fixture proves is the conversion — prices to integer
micros, deprecated rows dropped, the clamp, the ordering — over real values.

The schema's tolerance for fields it does not read is tested directly, by
`gateway-models.test.ts` adding one, rather than by this file happening to
contain some.

**A refresh replaces this file with what the gateway sends**, under a
`.recorded.` name, on the first run of `bun run catalogue:models` from a machine
that also saves the response. Until then the gap is here in writing rather than
implied by a filename.
