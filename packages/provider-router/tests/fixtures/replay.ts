import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import type { RouterClient } from "../../src/client.ts";

/**
 * The recorded-transport harness: no test in this package reaches the network.
 *
 * The fixtures beside this file are the wire format itself — server-sent events
 * in the `event:`/`data:` framing the Responses API emits, plus the JSON error
 * bodies it returns for a 401, a 404, a 429 and a 500. They are replayed
 * through a real `OpenAI` client with an injected `fetch`, so every test
 * exercises the SDK's own SSE decoder, its error classification and its abort
 * handling. A fake that skipped the SDK would only prove this package agrees
 * with itself.
 *
 * The bytes are delivered in chunks that do not respect event boundaries,
 * because a real socket does not either: an event split across two TCP reads is
 * the ordinary case, and a decoder that only works on whole events would pass a
 * neater harness and fail in production.
 *
 * The fixtures are **synthesised, not recorded** — see `README.md` here.
 */

/** A default that splits most events across at least two chunks. */
const DEFAULT_CHUNK_BYTES = 64;

const SSE_HEADERS = { "content-type": "text/event-stream" };
const JSON_HEADERS = {
  "content-type": "application/json",
  "x-request-id": "req_011CQTEST",
};

const encoder = new TextEncoder();

export const TEST_API_KEY = "sk-proj-test-key-not-a-real-credential";

export const readFixture = async (name: string): Promise<string> =>
  Bun.file(fileURLToPath(new URL(`./${name}`, import.meta.url))).text();

export type RecordedCall = { readonly url: string; readonly body: unknown };

export type Transport = {
  readonly client: RouterClient;
  /** The requests the adapter made, in order. */
  readonly calls: RecordedCall[];
  /** Whether the request was cancelled — an abort, or a consumer that left. */
  readonly wasCancelled: () => boolean;
};

type Responder = (signal: AbortSignal | undefined) => Response;

const parseBody = (init: RequestInit | undefined): unknown => {
  const body = init?.body;
  if (typeof body !== "string" || body.length === 0) return undefined;
  return JSON.parse(body);
};

const transportOver = (respond: Responder): Transport => {
  const calls: RecordedCall[] = [];
  let cancelled = false;
  const fetch = (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    calls.push({ body: parseBody(init), url: String(input) });
    const signal = init?.signal ?? undefined;
    if (signal !== null && signal !== undefined) {
      signal.addEventListener(
        "abort",
        () => {
          cancelled = true;
        },
        { once: true },
      );
    }
    return Promise.resolve(respond(signal ?? undefined));
  };
  return {
    calls,
    client: new OpenAI({
      apiKey: TEST_API_KEY,
      fetch,
      logLevel: "off",
      maxRetries: 0,
    }),
    wasCancelled: () => cancelled,
  };
};

const streamOf = (
  text: string,
  chunkBytes: number,
): ReadableStream<Uint8Array> => {
  const bytes = encoder.encode(text);
  let offset = 0;
  return new ReadableStream({
    pull: (controller) => {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkBytes));
      offset += chunkBytes;
    },
  });
};

/** Replays a recorded event stream as a 200. */
export const replaying = (
  sse: string,
  chunkBytes = DEFAULT_CHUNK_BYTES,
): Transport =>
  transportOver(
    () =>
      new Response(streamOf(sse, chunkBytes), {
        headers: SSE_HEADERS,
        status: 200,
      }),
  );

/** Replays a recorded error body at the given status. */
export const failing = (status: number, body: string): Transport =>
  transportOver(() => new Response(body, { headers: JSON_HEADERS, status }));

/**
 * Replays a prefix, then holds the connection open until it is cancelled.
 *
 * This is what an abort has to interrupt: a response that has begun and has
 * more coming. When the signal fires the body errors the way a severed socket
 * does, which is what the SDK sees in production.
 */
export const hanging = (prefix: string): Transport =>
  transportOver((signal) => {
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(encoder.encode(prefix));
        const abort = (): void => {
          controller.error(
            new DOMException("The operation was aborted.", "AbortError"),
          );
        };
        if (signal === undefined) return;
        if (signal.aborted) {
          abort();
          return;
        }
        signal.addEventListener("abort", abort, { once: true });
      },
    });
    return new Response(stream, { headers: SSE_HEADERS, status: 200 });
  });

/** Replays a stream whose transport fails before the turn completes. */
export const networkFailure = (): Transport =>
  transportOver(
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start: (controller) => {
            controller.error(new TypeError("terminated"));
          },
        }),
        { headers: SSE_HEADERS, status: 200 },
      ),
  );

/** The SDK's decoded event stream, for driving the fold without the adapter. */
export const responsesStream = async (sse: string, chunkBytes?: number) =>
  replaying(sse, chunkBytes).client.responses.create({
    input: "",
    model: "gpt-5",
    stream: true,
  });
