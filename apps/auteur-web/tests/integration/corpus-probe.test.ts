import { describe, expect, test } from "bun:test";
import { ROUTES } from "@auteur/api-contract/routes";
import { toHttpResponse } from "@auteur/errors/to-http-response";
import { Hono } from "hono";
import {
  corpusProbeRoutes,
  PROBE_TARGETS,
  probeOne,
} from "../../server/_routes/corpus-probe.ts";

/**
 * The probe answers even when the network does not.
 *
 * Its whole job is to come back with a word for what happened, including when
 * what happened is silence — a diagnostic that can itself hang is one more
 * thing to diagnose.
 */

const CRON = "a-cron-secret-of-16-plus";

describe("every outcome is a word, not an exception", () => {
  test("a reachable host is ok, with what it sent", async () => {
    const result = await probeOne(
      { host: "corpus.auteur.test", url: "https://corpus.auteur.test/x" },
      async () => new Response("PROJECT GUTENBERG"),
    );
    expect(result.outcome).toBe("ok");
    expect(result.status).toBe(200);
    expect(result.detail).toContain("bytes read");
  });

  test("a refusal keeps the status, the server, and the body", async () => {
    // The three that tell an edge block from an application's own answer.
    const result = await probeOne(
      { host: "corpus.auteur.test", url: "https://corpus.auteur.test/x" },
      async () =>
        new Response("Attention Required! | Cloudflare", {
          headers: { server: "cloudflare" },
          status: 403,
        }),
    );
    expect(result.outcome).toBe("refused");
    expect(result.status).toBe(403);
    expect(result.detail).toContain("cloudflare");
    expect(result.detail).toContain("Cloudflare");
  });

  test("silence is a timeout, not a hang", async () => {
    const result = await probeOne(
      { host: "corpus.auteur.test", url: "https://corpus.auteur.test/x" },
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("timed out", "TimeoutError"));
          });
        }),
      20,
    );
    expect(result.outcome).toBe("timeout");
    expect(result.status).toBeNull();
    expect(result.ms).toBeGreaterThanOrEqual(20);
  });

  test("a refused connection is an error with its message", async () => {
    const result = await probeOne(
      { host: "corpus.auteur.test", url: "https://corpus.auteur.test/x" },
      () => Promise.reject(new Error("ECONNREFUSED")),
    );
    expect(result.outcome).toBe("error");
    expect(result.detail).toBe("ECONNREFUSED");
  });
});

describe("the route", () => {
  // Mounted the way the app mounts it, because the error mapping is the app's:
  // a router asked for its own status would answer 500 for everything.
  const mounted = (): Hono => {
    const app = new Hono();
    app.onError((thrown) => {
      const { body, status } = toHttpResponse(thrown);
      return Response.json(body, { status });
    });
    app.route(
      "/",
      corpusProbeRoutes({
        cronSecret: CRON,
        fetch: async () => new Response("ok"),
      }),
    );
    return app;
  };

  const request = (token: string | null) =>
    mounted().request(ROUTES.corpusProbe.path, {
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
    });

  test("it reaches both hosts and reports both", async () => {
    // The catalogue and the book text are two hosts, and the answer for one
    // does not imply the answer for the other — which is the entire reason
    // this exists.
    const response = await request(CRON);
    expect(response.status).toBe(200);
    const body = ROUTES.corpusProbe.response.parse(await response.json());
    expect(body.results.map((row) => row.host)).toEqual(
      PROBE_TARGETS.map((target) => target.host),
    );
  });

  test("it carries the scheduler's token, not the API token", async () => {
    expect((await request(null)).status).toBe(401);
    expect((await request("b-cron-secret-of-16-plus")).status).toBe(401);
  });
});
