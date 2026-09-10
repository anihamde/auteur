import { describe, expect, test } from "bun:test";
import { ROUTES } from "@auteur/api-contract/routes";
import { createLogger } from "@auteur/logger/logger";
import {
  createInvokeStage,
  DISPATCH_GRACE_MS,
} from "../../server/_internal/invoke-stage.ts";
import {
  SIGNATURE_HEADER,
  signPayload,
} from "../../server/_internal/signature.ts";

/**
 * The one thing between a queued stage and a running one.
 *
 * This lived in `entry.ts`, which nothing imports and nothing type-checked, and
 * it dropped its own promise with `void`. A serverless instance is frozen the
 * moment its response is written, so the request was never sent: not refused,
 * not lost, never dispatched. No stage the product ever ran was started by it.
 */

const SECRET = "a-stage-secret-of-16-plus";
const silent = createLogger({ bound: {} });

const deps = (
  overrides: Partial<Parameters<typeof createInvokeStage>[0]> = {},
) => ({
  logger: silent,
  origin: () => "https://deployment.test",
  stageSecret: () => SECRET,
  ...overrides,
});

const input = {
  queueId: "01a08c1f-0000-7000-8000-000000000001",
  sessionId: "01a08c1f-0000-7000-8000-000000000002",
  stageId: "corpus-select",
};

describe("the request outlives the response that asked for it", () => {
  test("the dispatch is handed to waitUntil, not dropped", async () => {
    // The defect, asserted directly. `void promise` type-checks, lints clean,
    // reads as deliberate, and on this platform means the fetch never happens.
    const handed: Promise<unknown>[] = [];
    const invoke = createInvokeStage(
      deps({
        fetch: async () => new Response("{}", { status: 200 }),
        waitUntil: (promise) => handed.push(promise),
      }),
    );

    await invoke(input);
    expect(handed).toHaveLength(1);
    await expect(handed[0]).resolves.toBeUndefined();
  });

  test("without waitUntil it still dispatches, for a runtime that does not freeze", async () => {
    // A local `vite dev` has no such platform call and needs none.
    let called = 0;
    const invoke = createInvokeStage(
      deps({
        fetch: async () => {
          called += 1;
          return new Response("{}", { status: 200 });
        },
      }),
    );

    await invoke(input);
    expect(called).toBe(1);
  });
});

describe("what it sends is what the internal route requires", () => {
  test("the signature covers the exact bytes of the body", async () => {
    // Signed over the raw body, so a signature computed from a re-serialized
    // object verifies a different string the moment key order differs.
    let seen: { url: string; body: string; signature: string } | undefined;
    const invoke = createInvokeStage(
      deps({
        fetch: async (url, init) => {
          const body = String(init?.body);
          const headers = init?.headers as Record<string, string>;
          seen = {
            body,
            signature: headers[SIGNATURE_HEADER] ?? "",
            url: String(url),
          };
          return new Response("{}", { status: 200 });
        },
      }),
    );

    await invoke(input);
    expect(seen?.url).toBe(
      `https://deployment.test${ROUTES.internalStage.path}`,
    );
    expect(seen?.signature).toBe(signPayload(SECRET, seen?.body ?? ""));
  });

  test("a protected deployment's bypass header is carried", async () => {
    // Deployment Protection puts a login wall in front of the hostname a stage
    // invokes, so without this every invocation reaches a page rather than the
    // route.
    let headers: Record<string, string> = {};
    const invoke = createInvokeStage(
      deps({
        extraHeaders: () => ({ "x-vercel-protection-bypass": "a-secret" }),
        fetch: async (_url, init) => {
          headers = (init?.headers ?? {}) as Record<string, string>;
          return new Response("{}", { status: 200 });
        },
      }),
    );

    await invoke(input);
    expect(headers["x-vercel-protection-bypass"]).toBe("a-secret");
  });
});

describe("the caller is held for the dispatch, not for the stage", () => {
  test("a callee that does not answer releases the caller at the grace period", async () => {
    // `waitUntil` holds the instance until the promise settles, and the callee
    // does not answer until its stage is done — so a caller that waited for
    // the response was alive for its own stage *and* its successor's, against
    // one 60-second ceiling. The deployment logged a 200 and
    // `Task timed out after 60 seconds` on the same request.
    const handed: Promise<unknown>[] = [];
    let released: ((value: Response) => void) | undefined;
    let waited = 0;
    const invoke = createInvokeStage(
      deps({
        delay: async (ms) => {
          waited = ms;
        },
        fetch: () =>
          new Promise<Response>((resolve) => {
            released = resolve;
          }),
        waitUntil: (promise) => handed.push(promise),
      }),
    );

    await invoke(input);
    // Settles on the timer while the response is still outstanding.
    await expect(handed[0]).resolves.toBeUndefined();
    expect(waited).toBe(DISPATCH_GRACE_MS);
    released?.(new Response("{}", { status: 200 }));
  });

  test("a refusal inside the grace period is still logged", async () => {
    // The whole point of keeping any grace at all: a 401 or a 500 comes back
    // immediately, and it is the one thing the caller can usefully report.
    const lines: string[] = [];
    const handed: Promise<unknown>[] = [];
    const invoke = createInvokeStage(
      deps({
        // A timer that never fires, so only the response can settle the race.
        delay: () => new Promise<void>(() => undefined),
        fetch: async () => new Response("", { status: 401 }),
        logger: { ...silent, error: (message: string) => lines.push(message) },
        waitUntil: (promise) => handed.push(promise),
      }),
    );

    await invoke(input);
    await Promise.all(handed);
    expect(lines).toEqual(["stage invocation refused"]);
  });
});

describe("a systematic refusal says so", () => {
  test("a non-2xx is logged with its status", async () => {
    // "The request was made and answered 401" is a different fact from "the
    // request was lost", and only one of them is what the sweep exists for.
    const lines: { message: string; fields: unknown }[] = [];
    const handed: Promise<unknown>[] = [];
    const invoke = createInvokeStage(
      deps({
        fetch: async () => new Response("", { status: 401 }),
        // No grace: this asserts what the answer produces, not the race.
        graceMs: 0,
        logger: {
          ...silent,
          error: (message: string, fields?: unknown) => {
            lines.push({ fields, message });
          },
        },
        waitUntil: (promise) => handed.push(promise),
      }),
    );

    // Awaited through `waitUntil`, which is the only handle on it a caller has
    // — and the reason the platform needs one.
    await invoke(input);
    await Promise.all(handed);
    expect(lines[0]?.message).toBe("stage invocation refused");
    expect(lines[0]?.fields).toMatchObject({ status: 401 });
  });

  test("a request that never arrives is logged as a different thing", async () => {
    const lines: string[] = [];
    const handed: Promise<unknown>[] = [];
    const invoke = createInvokeStage(
      deps({
        fetch: () => Promise.reject(new TypeError("fetch failed")),
        graceMs: 0,
        logger: { ...silent, error: (message: string) => lines.push(message) },
        waitUntil: (promise) => handed.push(promise),
      }),
    );

    await invoke(input);
    await Promise.all(handed);
    expect(lines).toEqual(["stage invocation failed"]);
  });
});
