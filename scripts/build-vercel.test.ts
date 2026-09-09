import { describe, expect, test } from "bun:test";
import {
  FUNCTION_DIR,
  MAX_DURATION,
  outputConfig,
  vcConfig,
} from "./build-vercel.ts";

describe("the generated function configuration", () => {
  test("the duration reaches the function", () => {
    // Stated once. Stated twice — here and in a `vercel.json` the platform no
    // longer reads for this — the deployment's real limit would be whichever
    // copy wins, and the other would go on looking correct.
    expect(JSON.parse(vcConfig(MAX_DURATION))).toMatchObject({
      maxDuration: MAX_DURATION,
    });
  });

  test("no duration means the platform's default, not a zero", () => {
    expect(Object.keys(JSON.parse(vcConfig(undefined)))).not.toContain(
      "maxDuration",
    );
  });

  test("the function answers as a stream", () => {
    // The events route is an SSE body that never ends. Without this the
    // response is buffered and the stream arrives when the run is over.
    expect(JSON.parse(vcConfig(300))).toMatchObject({
      supportsResponseStreaming: true,
    });
  });
});

describe("the generated output configuration", () => {
  test("the schedule from vercel.json is what the deployment gets", () => {
    const crons = [{ path: "/api/internal/cron/sweep", schedule: "0 4 * * *" }];
    expect(JSON.parse(outputConfig({ crons }))).toMatchObject({
      crons,
      version: 3,
    });
  });

  test("no schedule is no crons key, rather than an empty one", () => {
    expect(JSON.parse(outputConfig({}))).not.toHaveProperty("crons");
  });

  test("a URL reaches the function, which its name alone does not do", () => {
    // A `.func` whose name carries a dynamic segment is not matched by that
    // name: the output has to say which URLs go to it. Without this the
    // deployment holds a function nothing can reach and a schedule naming a
    // path that resolves to nothing — which the platform rejects after a clean
    // build, with no message under it.
    const { routes } = JSON.parse(outputConfig({})) as {
      routes: { dest?: string; handle?: string; src?: string }[];
    };
    const api = routes[0];
    expect(api?.dest).toBe(
      `/api/${FUNCTION_DIR.split("/").pop()?.replace(".func", "") ?? ""}`,
    );
    expect(new RegExp(api?.src ?? "").test("/api/health")).toBe(true);
    expect(new RegExp(api?.src ?? "").test("/api/internal/cron/sweep")).toBe(
      true,
    );
    expect(new RegExp(api?.src ?? "").test("/assets/index.js")).toBe(false);
  });

  test("routes claim /api before the filesystem, and the client after it", () => {
    // Order is the whole of the behaviour: a static file must not be able to
    // shadow a route, and a path the client owns must reach index.html rather
    // than a 404.
    const { routes } = JSON.parse(outputConfig({})) as {
      routes: { dest?: string; handle?: string; src?: string }[];
    };
    expect(routes.map((route) => route.handle ?? route.dest)).toEqual([
      "/api/[...path]",
      "filesystem",
      "/index.html",
    ]);
  });
});

describe("the function is named as the path it answers", () => {
  test("the directory is the catch-all under api/", () => {
    // The output file system mirrors the URL, so this name is the routing.
    expect(FUNCTION_DIR).toBe("functions/api/[...path].func");
  });
});
