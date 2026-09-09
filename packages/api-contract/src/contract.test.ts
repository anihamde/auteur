import { describe, expect, test } from "bun:test";
import {
  methodFor,
  parseBody,
  parseQuery,
  pathFor,
  publicRoutes,
  streamingRoutes,
} from "./contract.ts";
import { ROUTE_NAMES, specOf } from "./routes.ts";

describe("the seventeen routes", () => {
  test("seventeen, counted from the object rather than written down", () => {
    // §7.1 says "fourteen" and lists seventeen — fourteen browser routes, the
    // SSE route, and the internal one. `docs/decisions/0005` works through it.
    // Counting from the object is what makes the number a property of the
    // contract rather than a comment that goes stale the same way.
    expect(ROUTE_NAMES).toHaveLength(17);
  });

  test("every §7.1 path is present, exactly once", () => {
    const paths = ROUTE_NAMES.map(
      (name) => `${specOf(name).method} ${specOf(name).path}`,
    );
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.sort()).toEqual(
      [
        "GET /api/health",
        "GET /api/models",
        "POST /api/sessions",
        "GET /api/sessions/:id",
        "PATCH /api/sessions/:id",
        "DELETE /api/sessions/:id",
        "GET /api/authors",
        "POST /api/sessions/:id/author",
        "POST /api/sessions/:id/answers",
        "POST /api/sessions/:id/advance",
        "POST /api/sessions/:id/regenerate",
        "POST /api/sessions/:id/cancel",
        "PUT /api/sessions/:id/pins",
        "GET /api/sessions/:id/export",
        "GET /api/sessions/:id/events",
        "POST /internal/stage",
        "GET /internal/cron/sweep",
      ].sort(),
    );
  });

  test("two routes are internal: the stage runner and the sweep", () => {
    // The two a browser never calls, which makes them the ones whose bodies
    // are most tempting to trust — and invariant 4 has no exception for
    // callers you wrote yourself. Both carry the stage secret rather than the
    // bearer token: a caller that can release a claim can disrupt a run.
    const internal = ROUTE_NAMES.filter(
      (name) => specOf(name).internal === true,
    );
    expect(internal.sort()).toEqual(["internalStage", "internalSweep"]);
    expect(publicRoutes()).not.toContain("internalStage");
    expect(publicRoutes()).not.toContain("internalSweep");
  });

  test("exactly one route streams, and it is the events route", () => {
    // The only one that reads the direct connection string: LISTEN is a
    // session-level feature a pooled connection cannot honour, and a pooled
    // LISTEN is accepted and then never delivers.
    expect(streamingRoutes()).toEqual(["events"]);
  });

  test("every route with a :param declares how to parse it", () => {
    for (const name of ROUTE_NAMES) {
      const spec = specOf(name);
      if (!spec.path.includes(":")) continue;
      expect([name, spec.params !== undefined]).toEqual([name, true]);
    }
  });

  test("every route that changes something declares a body, and no GET does", () => {
    for (const name of ROUTE_NAMES) {
      const spec = specOf(name);
      if (spec.method === "GET") {
        expect([name, spec.body]).toEqual([name, undefined]);
      }
    }
  });
});

describe("paths are built in one place", () => {
  test("a param is filled", () => {
    expect(pathFor("session", { id: "abc" })).toBe("/api/sessions/abc");
  });

  test("a missing param is an error naming the route and the param", () => {
    expect(() => pathFor("session")).toThrow("needs a id");
  });

  test("a param is encoded", () => {
    // A uuid needs no encoding today, but the function that does not encode is
    // the one still there when a path parameter becomes a slug.
    expect(pathFor("session", { id: "a/b" })).toBe("/api/sessions/a%2Fb");
  });

  test("a route with no params needs none", () => {
    expect(pathFor("health")).toBe("/api/health");
    expect(methodFor("health")).toBe("GET");
  });
});

describe("bodies and queries are parsed, never trusted", () => {
  test("a valid body round-trips", () => {
    expect(
      parseBody("createSession", {
        idea: "a lighthouse keeper",
        lengthPreset: "flash",
      }),
    ).toEqual({ idea: "a lighthouse keeper", lengthPreset: "flash" });
  });

  test("an invalid body is invalid_input, with the issues in detail", () => {
    // The message is read by a person and the issues by a log. A zod issue
    // list rendered into a user-facing sentence is a sentence nobody can act
    // on.
    try {
      parseBody("createSession", { idea: "", lengthPreset: "epic" });
      throw new Error("should have thrown");
    } catch (thrown) {
      const error = thrown as {
        code?: string;
        message: string;
        detail?: { issues?: unknown[] };
      };
      expect(error.code).toBe("invalid_input");
      expect(error.message).not.toContain("lengthPreset");
      expect(error.detail?.issues?.length).toBeGreaterThan(0);
    }
  });

  test("the internal route's body is parsed like every other", () => {
    expect(() => parseBody("internalStage", { stageId: "draft" })).toThrow(
      "not valid",
    );
  });

  test("a cursor arrives as a string and is coerced to a number", () => {
    // It comes off a query string, where everything is a string. Coercing at
    // the boundary is what keeps `cursor > seq` from being a string compare.
    expect(parseQuery("events", { cursor: "12" })).toEqual({ cursor: 12 });
  });

  test("a negative cursor is refused", () => {
    expect(() => parseQuery("events", { cursor: "-1" })).toThrow("not valid");
  });

  test("a route with no body parses to undefined rather than throwing", () => {
    expect(parseBody("health", { anything: true })).toBeUndefined();
  });
});

describe("the regenerate body is a discriminated union", () => {
  test("an outline regeneration needs no offsets", () => {
    expect(parseBody("regenerate", { kind: "outline" })).toEqual({
      kind: "outline",
    });
  });

  test("a selection needs both offsets", () => {
    expect(() =>
      parseBody("regenerate", { from: 0, kind: "selection" }),
    ).toThrow();
    expect(
      parseBody("regenerate", { from: 0, kind: "selection", to: 100 }),
    ).toEqual({ from: 0, kind: "selection", to: 100 });
  });

  test("an unknown kind is refused rather than defaulted", () => {
    expect(() => parseBody("regenerate", { kind: "everything" })).toThrow();
  });
});
