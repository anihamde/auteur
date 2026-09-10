import { describe, expect, test } from "bun:test";
import {
  INVOCATION_CEILING_SECONDS,
  STALE_AFTER_SECONDS,
} from "../packages/stage-queue/src/sweep.ts";
import {
  CRONS,
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

  test("the duration is one the plan accepts", () => {
    // A `.vc-config.json` asking for more than the plan's ceiling is rejected
    // when the output is uploaded — after a clean build, with no message in
    // the build log, because the build is not what failed.
    expect(MAX_DURATION).toBeLessThanOrEqual(60);
    expect(MAX_DURATION).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_DURATION)).toBe(true);
  });

  test("the sweep's idea of the ceiling is the ceiling", () => {
    // `packages/` may not import from `scripts/`, so the sweep carries its own
    // copy of this number and nothing but this test holds the two together.
    // They drifted once: the sweep waited 300 seconds for a claim the platform
    // had already killed at 60, and a killed stage was unrecoverable for four
    // minutes while the screen showed a spinner.
    expect(INVOCATION_CEILING_SECONDS).toBe(MAX_DURATION);
  });

  test("a claim is released after the ceiling, not long after it", () => {
    // Above the ceiling, because a stage that claimed a row a second before
    // its clock started is not lost. Not far above it, because nothing can
    // legitimately hold a claim past the ceiling at all.
    expect(STALE_AFTER_SECONDS).toBeGreaterThan(MAX_DURATION);
    expect(STALE_AFTER_SECONDS).toBeLessThanOrEqual(MAX_DURATION * 2);
  });

  test("the handler is the bundle, and the helpers are off", () => {
    // The helpers give a bare handler `req.body` and friends by reading the
    // body first, which is exactly what a request listener must be handed
    // unread.
    expect(JSON.parse(vcConfig(MAX_DURATION))).toMatchObject({
      handler: "index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
    });
  });

  test("the function answers as a stream", () => {
    // The events route is an SSE body that never ends. Without this the
    // response is buffered and the stream arrives when the run is over.
    expect(JSON.parse(vcConfig(MAX_DURATION))).toMatchObject({
      supportsResponseStreaming: true,
    });
  });
});

describe("the generated output configuration", () => {
  test("the schedule is declared once, here", () => {
    // The platform reads `vercel.json` and this generated config both, and the
    // same entry in each is rejected outright: "A duplicated cron job with the
    // same schedule and path was found." `vercel.json` is down to the two
    // commands.
    expect(JSON.parse(outputConfig())).toMatchObject({ crons: CRONS });
  });

  test("the schedule is not minute-level", () => {
    // The plan allows one firing a day. The sweep runs on traffic; this is the
    // backstop for a deployment nobody is using, and a minute-level expression
    // is refused at build time.
    for (const cron of CRONS) {
      expect(cron.schedule.startsWith("* ")).toBe(false);
      expect(cron.schedule).not.toContain("*/");
    }
  });

  test("a URL reaches the function, which its name alone does not do", () => {
    // A `.func` whose name carries a dynamic segment is not matched by that
    // name: the output has to say which URLs go to it. Without this the
    // deployment holds a function nothing can reach and a schedule naming a
    // path that resolves to nothing — which the platform rejects after a clean
    // build, with no message under it.
    const { routes } = JSON.parse(outputConfig()) as {
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
    const { routes } = JSON.parse(outputConfig()) as {
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
