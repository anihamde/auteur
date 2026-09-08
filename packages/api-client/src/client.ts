import {
  type BodyInputOf,
  methodFor,
  parseBody,
  pathFor,
  type QueryInputOf,
  type ResponseOf,
} from "@auteur/api-contract/contract";
import {
  errorResponseSchema,
  ROUTES,
  type RouteName,
} from "@auteur/api-contract/routes";
import type { Fetch } from "@auteur/api-contract/transport";
import { AuteurError } from "@auteur/errors/auteur-error";
import { isErrorCode } from "@auteur/errors/error-code";

/**
 * The client, generated from the contract.
 *
 * There is one `call` and no per-route method, and that is the point: a
 * hand-written method per route is sixteen places for the client and the server
 * to drift, and the drift would be a run-time 404 rather than a compile error.
 * Here a route removed from `ROUTES` removes it from `RouteName`, and every
 * call site naming it stops compiling.
 *
 * The response is **parsed** with the contract's own schema. A client that cast
 * would turn a server-side shape change into `undefined` somewhere in a
 * component, three renders from the request that caused it.
 */

export type ClientConfig = {
  readonly baseUrl?: string;
  /** Injected so every test runs offline. */
  readonly fetch?: Fetch;
};

export type CallOptions<Name extends RouteName> = {
  readonly params?: Readonly<Record<string, string>>;
  readonly body?: BodyInputOf<Name>;
  readonly query?: QueryInputOf<Name>;
  readonly signal?: AbortSignal;
};

/**
 * Turn an error response into an `AuteurError`.
 *
 * The server's taxonomy travels: a `rate_limited` reaching the browser as a
 * generic failure would make the one thing the UI can act on — wait and retry —
 * indistinguishable from the one it cannot. An unrecognised code becomes
 * `internal` rather than being trusted, because a code the client does not know
 * is one it has no branch for anyway.
 */
const toError = (status: number, payload: unknown): AuteurError => {
  const parsed = errorResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return new AuteurError("internal", "The server sent an unreadable error.", {
      detail: { status },
    });
  }
  const { code, message } = parsed.data.error;
  return new AuteurError(isErrorCode(code) ? code : "internal", message, {
    detail: { status },
  });
};

export const createClient = (config: ClientConfig = {}) => {
  const call = async <Name extends RouteName>(
    name: Name,
    options: CallOptions<Name> = {},
  ): Promise<ResponseOf<Name>> => {
    const spec = ROUTES[name];
    const url = new URL(
      `${config.baseUrl ?? ""}${pathFor(name, options.params ?? {})}`,
      config.baseUrl ?? "http://localhost",
    );
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, String(value));
    }

    // The body is parsed before it is sent. A client that sent an invalid body
    // and let the server reject it turns a bug in this file into a 400 the user
    // sees, and the stack that produced it is gone by then.
    const body =
      options.body === undefined ? undefined : parseBody(name, options.body);

    const response = await (config.fetch ?? globalThis.fetch)(url.toString(), {
      method: methodFor(name),
      ...(body !== undefined && {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      ...(options.signal !== undefined && { signal: options.signal }),
    });

    if (!response.ok) {
      throw toError(response.status, await response.json().catch(() => null));
    }

    // `export` returns text/markdown, and its response schema is a string.
    const payload: unknown =
      spec.response.def.type === "string"
        ? await response.text()
        : await response.json();

    const parsed = spec.response.safeParse(payload);
    if (!parsed.success) {
      throw new AuteurError(
        "internal",
        "The server sent a response this client cannot read.",
        { detail: { issues: parsed.error.issues, route: name } },
      );
    }
    return parsed.data as ResponseOf<Name>;
  };

  return { call };
};

export type ApiClient = ReturnType<typeof createClient>;
