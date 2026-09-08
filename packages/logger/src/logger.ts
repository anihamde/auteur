/**
 * Structured JSON logging: one line per record, one object per line.
 *
 * The only non-obvious part is redaction, and it is the reason this package
 * exists rather than being three lines at each call site. Keys are matched by
 * name at every depth, so a provider response spliced whole into a log record
 * loses its `authorization` header without the caller having remembered to
 * strip it. A convention would be forgotten exactly once, which is once too
 * many for a repository whose logs carry a model-gateway key.
 */
export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogFields = Readonly<Record<string, unknown>>;

/**
 * Key names whose values are replaced wherever they appear.
 *
 * Matched case-insensitively, and on the key rather than the value: a value
 * heuristic ("looks like a token") both misses real secrets and redacts prose
 * that happens to be long and random, and the prose here is generated fiction.
 */
const REDACTED_KEYS = [
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "password",
  "secret",
  "token",
];

const REDACTED = "[redacted]";

const isRedactedKey = (key: string): boolean => {
  const lower = key.toLowerCase();
  return REDACTED_KEYS.some((needle) => lower.includes(needle));
};

/**
 * `value` with every secret-named key replaced, at every depth.
 *
 * Cycles are broken rather than thrown on: a log call is not a place to fail.
 * Depth is capped for the same reason — a deeply nested structure is a bug in
 * the caller, and the log should say so rather than exhaust the stack.
 */
const redact = (value: unknown, seen: WeakSet<object>, depth = 0): unknown => {
  if (depth > 12) {
    return "[too deep]";
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry, seen, depth + 1));
  }
  if (typeof value === "object" && value !== null) {
    if (seen.has(value)) {
      return "[circular]";
    }
    seen.add(value);
    if (value instanceof Error) {
      return { message: value.message, name: value.name };
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        isRedactedKey(key) ? REDACTED : redact(entry, seen, depth + 1),
      ]),
    );
  }
  return value;
};

export type Logger = {
  readonly debug: (message: string, fields?: LogFields) => void;
  readonly info: (message: string, fields?: LogFields) => void;
  readonly warn: (message: string, fields?: LogFields) => void;
  readonly error: (message: string, fields?: LogFields) => void;
  /** A logger that adds `fields` to every record it writes. */
  readonly with: (fields: LogFields) => Logger;
};

export type LoggerOptions = {
  /** Defaults to `process.stdout.write`. Injected so a test can read records. */
  readonly write?: (line: string) => void;
  /** Defaults to `Date.now`. Injected so a record's time is assertable. */
  readonly now?: () => number;
  readonly bound?: LogFields;
};

export const createLogger = (options: LoggerOptions = {}): Logger => {
  const write =
    options.write ??
    ((line: string): void => {
      process.stdout.write(line);
    });
  const now = options.now ?? Date.now;
  const bound = options.bound ?? {};

  const emit = (
    level: LogLevel,
    message: string,
    fields: LogFields | undefined,
  ): void => {
    const record = redact(
      { ...bound, ...fields, level, message, time: now() },
      new WeakSet(),
    );
    write(`${JSON.stringify(record)}\n`);
  };

  return {
    debug: (message, fields) => {
      emit("debug", message, fields);
    },
    error: (message, fields) => {
      emit("error", message, fields);
    },
    info: (message, fields) => {
      emit("info", message, fields);
    },
    warn: (message, fields) => {
      emit("warn", message, fields);
    },
    with: (fields) =>
      createLogger({ ...options, bound: { ...bound, ...fields } }),
  };
};
