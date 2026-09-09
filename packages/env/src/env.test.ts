import { beforeEach, describe, expect, test } from "bun:test";
import { env, resetEnvForTest } from "./env.ts";
import { ENV_KEYS, ENV_SPEC } from "./env-spec.ts";

const validValue = (key: string): string =>
  key.startsWith("DATABASE_URL")
    ? "postgres://user:pw@host/db"
    : "a-sufficiently-long-secret";

const complete = (): Record<string, string> =>
  Object.fromEntries(ENV_KEYS.map((key) => [key, validValue(key)]));

beforeEach(() => {
  resetEnvForTest();
});

describe("the scheduler's secret is read under the platform's name", () => {
  test("the key is CRON_SECRET, with no prefix", () => {
    // Vercel Cron attaches `Authorization: Bearer <value>` only when a
    // variable named exactly `CRON_SECRET` exists. Renaming this to match the
    // `AUTEUR_` convention of its neighbours would leave the scheduler sending
    // no Authorization header at all: the sweep would 401 once a minute for
    // the life of the deployment, on a schedule that reports each 401 as a
    // delivered request. There is no other detector for that.
    expect(ENV_KEYS).toContain("CRON_SECRET");
  });
});

describe("a complete environment parses", () => {
  test("every declared key is returned", () => {
    expect(Object.keys(env(complete())).sort()).toEqual([...ENV_KEYS].sort());
  });

  test("the parse is memoized: a later source is ignored", () => {
    const first = env(complete());
    expect(env({})).toBe(first);
  });

  test("nothing is parsed at import time", () => {
    // The property that keeps a pure package's unit tests runnable without a
    // database URL. If `env` were called at module scope, importing this file
    // with an empty environment would have thrown before any test ran.
    resetEnvForTest();
    expect(() => env({})).toThrow();
  });
});

describe("an incomplete environment fails fast, naming everything wrong", () => {
  test("a missing variable is named", () => {
    const source = complete();
    delete source["RAMP_ROUTER_API_KEY"];
    expect(() => env(source)).toThrow("RAMP_ROUTER_API_KEY is unset");
  });

  test("an empty string counts as unset", () => {
    expect(() => env({ ...complete(), AUTEUR_API_TOKEN: "" })).toThrow(
      "AUTEUR_API_TOKEN is unset",
    );
  });

  test("every missing variable is reported in one run", () => {
    // Fixing five variables should take one run, not five.
    let message = "";
    try {
      env({});
    } catch (thrown) {
      message = (thrown as Error).message;
    }
    for (const key of ENV_KEYS) {
      expect(message).toContain(key);
    }
  });

  test("a malformed value is reported without echoing it", () => {
    // These are secrets. A diagnostic that prints one puts it in a log and a
    // terminal history.
    let message = "";
    try {
      env({ ...complete(), DATABASE_URL: "not-a-url-hunter2" });
    } catch (thrown) {
      message = (thrown as Error).message;
    }
    expect(message).toContain("DATABASE_URL is set but invalid");
    expect(message).not.toContain("hunter2");
  });

  test("a too-short token is invalid rather than accepted", () => {
    expect(() => env({ ...complete(), AUTEUR_API_TOKEN: "short" })).toThrow(
      "AUTEUR_API_TOKEN is set but invalid",
    );
  });
});

describe("the two database URLs are distinct requirements", () => {
  test("both are required", () => {
    // ARCHITECTURE.md §3.1: pooled for every route, direct for the SSE one
    // because LISTEN is session-level. Collapsing them to one would make the
    // stream silently fail to receive notifications.
    expect(ENV_KEYS).toContain("DATABASE_URL");
    expect(ENV_KEYS).toContain("DATABASE_URL_DIRECT");
    const source = complete();
    delete source["DATABASE_URL_DIRECT"];
    expect(() => env(source)).toThrow("DATABASE_URL_DIRECT is unset");
  });

  test("every key describes itself, for the diagnostic and .env.example", () => {
    for (const key of ENV_KEYS) {
      expect(ENV_SPEC[key].describe.length).toBeGreaterThan(20);
    }
  });
});

describe(".env.example mirrors the schema", () => {
  test("it names exactly the declared keys, no more and no fewer", async () => {
    // The failure this prevents: a variable added to the schema and not to the
    // example, so a new contributor's environment is incomplete in a way only
    // the runtime tells them about. The mirror is asserted, not remembered.
    const text = await Bun.file(
      new URL("../../../.env.example", import.meta.url),
    ).text();
    const documented = [...text.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(
      (match) => match[1],
    );
    expect(documented.sort()).toEqual([...ENV_KEYS].sort());
  });

  test("no value is filled in", () => {
    // An example carrying a real value is a secret in the repository.
    return Bun.file(new URL("../../../.env.example", import.meta.url))
      .text()
      .then((text) => {
        for (const line of text.split("\n")) {
          if (/^[A-Z][A-Z0-9_]*=/.test(line)) {
            expect(line).toMatch(/=$/);
          }
        }
      });
  });
});
