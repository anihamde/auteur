import { describe, expect, test } from "bun:test";
import { createLogger, type LogFields } from "./logger.ts";

const capture = (): {
  readonly logger: ReturnType<typeof createLogger>;
  readonly records: Record<string, unknown>[];
} => {
  const records: Record<string, unknown>[] = [];
  const logger = createLogger({
    now: () => 1_700_000_000_000,
    write: (line) => {
      records.push(JSON.parse(line) as Record<string, unknown>);
    },
  });
  return { logger, records };
};

describe("one JSON object per line", () => {
  test("a record carries level, message and time", () => {
    const { logger, records } = capture();
    logger.info("corpus fetched", { works: 12 });
    expect(records[0]).toEqual({
      level: "info",
      message: "corpus fetched",
      time: 1_700_000_000_000,
      works: 12,
    });
  });

  test("every line is one object and ends with exactly one newline", () => {
    const lines: string[] = [];
    const logger = createLogger({ write: (line) => lines.push(line) });
    logger.info("a\nmessage with a newline in it");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.endsWith("\n")).toBe(true);
    expect(lines[0]?.slice(0, -1)).not.toContain("\n");
  });

  test("`with` binds fields onto every later record and does not mutate", () => {
    const { logger, records } = capture();
    const bound = logger.with({ sessionId: "s1" });
    bound.warn("stale");
    logger.warn("unbound");
    expect(records[0]?.["sessionId"]).toBe("s1");
    expect(records[1]?.["sessionId"]).toBeUndefined();
  });
});

describe("redaction is by key name, at every depth", () => {
  const key = "sk-live-do-not-log-me";

  test.each([
    ["apiKey", { apiKey: key }],
    ["api_key", { api_key: key }],
    ["Authorization", { Authorization: key }],
    ["RAMP_ROUTER_API_KEY", { RAMP_ROUTER_API_KEY: key }],
    ["authToken", { authToken: key }],
    ["cookie", { cookie: key }],
    ["dbPassword", { dbPassword: key }],
    ["stageSecret", { stageSecret: key }],
  ])("%s is replaced", (_label, fields) => {
    const { logger, records } = capture();
    logger.info("call", fields as LogFields);
    expect(JSON.stringify(records[0])).not.toContain("do-not-log-me");
    expect(JSON.stringify(records[0])).toContain("[redacted]");
  });

  test("nested five deep, and inside an array", () => {
    // The case a call site would get wrong: a provider response spliced in
    // whole. Nobody strips a header they did not know was there.
    const { logger, records } = capture();
    logger.error("provider failed", {
      response: { request: { headers: [{ authorization: key }] } },
    });
    expect(JSON.stringify(records[0])).not.toContain("do-not-log-me");
  });

  test("a key that merely contains the word is redacted", () => {
    const { logger, records } = capture();
    logger.info("x", { xApiKeyHeader: key });
    expect(JSON.stringify(records[0])).not.toContain("do-not-log-me");
  });

  test("prose that looks random is not redacted", () => {
    // Generated fiction is long and high-entropy. A value heuristic would eat
    // it; matching on the key name does not.
    const { logger, records } = capture();
    logger.info("draft", { markdown: "Tlon Uqbar Orbis Tertius zzqx" });
    expect(records[0]?.["markdown"]).toBe("Tlon Uqbar Orbis Tertius zzqx");
  });
});

describe("a log call never throws", () => {
  test("a cycle is reported rather than thrown on", () => {
    const { logger, records } = capture();
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic["self"] = cyclic;
    expect(() => logger.info("cyclic", { cyclic })).not.toThrow();
    expect(JSON.stringify(records[0])).toContain("[circular]");
  });

  test("an Error becomes name and message, not a stack", () => {
    const { logger, records } = capture();
    logger.error("failed", { cause: new Error("the socket closed") });
    expect(records[0]?.["cause"]).toEqual({
      message: "the socket closed",
      name: "Error",
    });
  });

  test("depth is capped rather than exhausting the stack", () => {
    const { logger, records } = capture();
    let deep: Record<string, unknown> = { end: true };
    for (let index = 0; index < 40; index += 1) {
      deep = { deep };
    }
    expect(() => logger.info("deep", { deep })).not.toThrow();
    expect(JSON.stringify(records[0])).toContain("[too deep]");
  });
});

describe("a field never shadows the record's own keys", () => {
  const lines: string[] = [];
  const log = createLogger({
    bound: {},
    now: () => 1,
    write: (line) => lines.push(line),
  });

  test("a field called message reaches the log, renamed", () => {
    // `runClaimedStage` passed the thrown error's sentence as `message`, and
    // the log printed `"message":"stage failed"`. Every stage failure for an
    // evening reported the label and swallowed the reason — the one thing a
    // log exists to carry.
    lines.length = 0;
    log.error("stage failed", { message: "draft did not return JSON." });
    const record = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    expect(record["message"]).toBe("stage failed");
    expect(record["field.message"]).toBe("draft did not return JSON.");
  });

  test("level and time are owned too", () => {
    lines.length = 0;
    log.info("ok", { level: "debug", time: 99 });
    const record = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    expect(record["level"]).toBe("info");
    expect(record["time"]).toBe(1);
    expect(record["field.level"]).toBe("debug");
    expect(record["field.time"]).toBe(99);
  });

  test("a bound field is protected the same way", () => {
    // Bound fields are set once and are the easiest place for this to hide.
    const bound: string[] = [];
    createLogger({
      bound: { message: "bound" },
      now: () => 1,
      write: (line) => bound.push(line),
    }).info("hello", {});
    const record = JSON.parse(bound[0] ?? "{}") as Record<string, unknown>;
    expect(record["message"]).toBe("hello");
    expect(record["field.message"]).toBe("bound");
  });

  test("an ordinary field is untouched", () => {
    lines.length = 0;
    log.info("ok", { stageId: "draft" });
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ stageId: "draft" });
  });
});
