import { describe, expect, test } from "bun:test";
import { FUNCTION_DIR, outputConfig, vcConfig } from "./build-vercel.ts";

describe("the generated function configuration", () => {
  test("the duration from vercel.json reaches the function", () => {
    // The number is stated once, in `vercel.json`, and read from there. Stated
    // twice, the deployment's real limit would be whichever copy the platform
    // reads — and the other would go on looking correct.
    expect(JSON.parse(vcConfig(300))).toMatchObject({ maxDuration: 300 });
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
    expect(JSON.parse(outputConfig({ crons }))).toEqual({ crons, version: 3 });
  });

  test("no schedule is no crons key, rather than an empty one", () => {
    expect(JSON.parse(outputConfig({}))).toEqual({ version: 3 });
  });
});

describe("the function is named as the path it answers", () => {
  test("the directory is the catch-all under api/", () => {
    // The output file system mirrors the URL, so this name is the routing.
    expect(FUNCTION_DIR).toBe("functions/api/[...path].func");
  });
});
