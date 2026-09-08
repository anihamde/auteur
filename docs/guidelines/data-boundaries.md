---
id: data-boundaries
title: Data boundaries
covers: Parsing external data, authoring schemas that are sent, versioning contracts
tier: if-touched
trigger: "You read external data — an API response, a message, JSON.parse, storage, URL params, env vars — or you declare a schema that is sent to another system, such as a tool definition given to a model."
---

# Data boundaries

## Everything external is `unknown` until parsed

External means anything the compiler did not produce: HTTP responses, request
bodies, WebSocket messages, `JSON.parse` output, `localStorage`, cookies, URL
and route params, environment variables, files, and query results from a
database.

Parse each with a schema — Zod, or an equivalent — at the point it enters. The
schema is the only thing that turns `unknown` into a typed value.

```ts
// wrong — a claim, unverified, that will surface as a TypeError elsewhere
const user = (await response.json()) as User;

// right — a verified value, or a loud failure right here
const user = userSchema.parse(await response.json());
```

Never `as`-cast external data. Never trust a generated client's types more than
the response it actually received.

## One boundary, one parse

Parse once, where the data enters, and pass the typed value inward. Re-parsing
in a helper is a defensive guard (see [errors](./errors.md)); passing `unknown`
inward and parsing deep inside means the boundary is in the wrong place.

The schema and the type live together, with the type derived from the schema so
they cannot drift:

```ts
export const userSchema = z.object({ id: z.uuid(), email: z.email() });
export type User = z.infer<typeof userSchema>;
```

## Environment variables

Parse the whole environment once, at startup, through one schema in one module.
Everything else imports the typed result. A missing or malformed variable fails
the boot, not the first request that reads it.

## Failure is explicit

`parse` throws, which is correct at a trust boundary you control. Use
`safeParse` when the failure is expected and the caller must decide — a user
submitting a form, an optional cached value. Do not `safeParse` and then fall
back to a default that hides a malformed payload.

## A schema you send is authored in the format that goes on the wire

The rules above are about schemas you **apply** to data arriving. A schema you
**send** to another system is the opposite direction and takes the opposite
rule: author it in the format that system consumes, so nothing translates it.

The case that keeps coming up is a tool definition given to a model. The
provider reads JSON Schema, so the tool's argument schema is authored as JSON
Schema — via TypeBox, whose output *is* JSON Schema — and forwarded verbatim.

```ts
// wrong — a conversion on the path of every request
const argSchema = z.object({
  query: z.string(),
  limit: z.number().int().min(1).max(20),
});
tools.push({ name: "search", parameters: zodToJsonSchema(argSchema) });

// right — the schema is the wire format; nothing to lose
const argSchema = Type.Object(
  {
    query: Type.String({ maxLength: 512 }),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
  },
  { additionalProperties: false },
);
tools.push({ name: "search", parameters: argSchema });
```

Converting is lossy in a way that fails silently: refinements, transforms,
branded types and `additionalProperties: false` are the constraints most likely
to be dropped, and a dropped constraint is one the model never sees and so
never respects. Nothing throws — you get arguments you did not allow, at
runtime, in production.

So a project may carry two schema libraries, and the rule that keeps them
apart is one line: **applied schemas are Zod, sent schemas are TypeBox.** Never
generate one from the other. A tool that also wants its arguments validated
before the handler runs parses them with a Zod schema written to match, and a
test asserts the two agree — two sources of truth held level by a test is
honest; one source silently degraded by a converter is not.

Everything a tool handler receives is still external data: parse it, and never
treat the schema you published as proof of what arrived.

## Versioning a contract that crosses a deploy boundary

When producer and consumer deploy separately — client and server, two services,
a queue, anything persisted — assume both versions run at once.

- **Additive changes only, by default.** New fields are optional, with the
  reader supplying the default. Never repurpose an existing field's meaning.
- **To remove or change a field**, ship in two releases: first make the reader
  accept both shapes, deploy it everywhere, then stop writing the old shape.
- **Version the envelope** when the shape genuinely breaks, and keep the parser
  for the old version until nothing emits it.
- **Never break a persisted shape in place.** Data already written cannot be
  redeployed; the reader must handle every version ever written, or a
  migration must rewrite it. See [migrations](./migrations.md).
