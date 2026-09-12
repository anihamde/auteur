import { beforeEach, describe, expect, test } from "bun:test";
import { env, envFor, resetEnvForTest } from "./env.ts";
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

describe("the deployment guide names every variable", () => {
  test("docs/DEPLOY.md lists each declared key", async () => {
    // A key added to the schema and not to the guide is a deployment that
    // fails at boot on a variable nobody was told to set. The guide is the
    // only place the client's build-time `VITE_API_TOKEN` is written down at
    // all, since it is not in this schema and `preflight` cannot see it.
    const guide = await Bun.file(
      `${import.meta.dir}/../../../docs/DEPLOY.md`,
    ).text();
    expect(ENV_KEYS.filter((key) => !guide.includes(key))).toEqual([]);
    expect(guide).toContain("VITE_API_TOKEN");
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

describe("a process validates what it uses, not what the repository has", () => {
  const complete = {
    AUTEUR_API_TOKEN: "a-token-of-at-least-16-chars",
    AUTEUR_STAGE_SECRET: "a-stage-secret-of-16-plus",
    CRON_SECRET: "a-cron-secret-of-16-plus!",
    DATABASE_URL: "postgres://u:p@host-pooler/db",
    DATABASE_URL_DIRECT: "postgres://u:p@host/db",
    RAMP_ROUTER_API_KEY: "a-router-key",
  };

  test("the worker's three parse with the route's three absent", () => {
    // The failure this exists for: the worker refused to start without an API
    // token, a stage secret and a cron secret. It serves no route and
    // authenticates nobody, so those are not merely unnecessary to it but
    // meaningless — and demanding them teaches whoever is deploying to set
    // secrets by superstition, which is how a real one gets set wrong.
    const worker = envFor(
      ["DATABASE_URL", "DATABASE_URL_DIRECT", "RAMP_ROUTER_API_KEY"],
      {
        DATABASE_URL: complete.DATABASE_URL,
        DATABASE_URL_DIRECT: complete.DATABASE_URL_DIRECT,
        RAMP_ROUTER_API_KEY: complete.RAMP_ROUTER_API_KEY,
      },
    );
    expect(worker.DATABASE_URL_DIRECT).toBe(complete.DATABASE_URL_DIRECT);
  });

  test("a subset still reports every one of its own that is missing", () => {
    // Narrowing what is required must not narrow how much of it is reported:
    // fixing two variables should take one run, not two.
    expect(() => envFor(["DATABASE_URL", "RAMP_ROUTER_API_KEY"], {})).toThrow(
      /DATABASE_URL[\s\S]*RAMP_ROUTER_API_KEY/,
    );
  });

  test("a subset is not memoized, so two callers do not collide", () => {
    // `env()` memoizes because it is the whole set and always the same. Two
    // subsets in one process would otherwise get whichever asked first.
    expect(envFor(["RAMP_ROUTER_API_KEY"], complete).RAMP_ROUTER_API_KEY).toBe(
      complete.RAMP_ROUTER_API_KEY,
    );
    expect(envFor(["DATABASE_URL"], complete).DATABASE_URL).toBe(
      complete.DATABASE_URL,
    );
  });

  test("env() still demands all of them", () => {
    // The routes do use all seven, and narrowing the worker must not narrow
    // the check the deployment they share is held to.
    resetEnvForTest();
    expect(() => env({ DATABASE_URL: complete.DATABASE_URL })).toThrow(
      /AUTEUR_API_TOKEN is unset/,
    );
  });
});
