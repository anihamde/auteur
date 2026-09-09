import { describe, expect, test } from "bun:test";
import { AuteurError } from "@auteur/errors/auteur-error";
import { Hono } from "hono";
import { boot } from "../../api/_boot.ts";

describe("a deployment that cannot be configured answers instead of crashing", () => {
  test("an incomplete environment answers every path with the list to fix", async () => {
    // What the platform does with a throw during import is
    // FUNCTION_INVOCATION_FAILED and a crash page — no route ran, so no route
    // could explain itself. The reason sits in a log somebody has to find.
    const app = boot(() => {
      throw new AuteurError(
        "internal",
        "The environment is incomplete:\n  - DATABASE_URL is unset",
      );
    });

    for (const path of ["/api/health", "/api/sessions", "/api/anything"]) {
      const response = await app.request(path);
      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: { message: string } };
      expect(body.error.message).toContain("DATABASE_URL");
    }
  });

  test("a POST gets the same answer as a GET", async () => {
    // `app.all`, not `app.get`: there is no route that could work, so the
    // method the caller chose changes nothing.
    const app = boot(() => {
      throw new AuteurError("internal", "The environment is incomplete:");
    });
    expect(
      (await app.request("/api/sessions", { method: "POST" })).status,
    ).toBe(500);
  });

  test("an unexpected throw does not reach the caller", async () => {
    // Boot is where a connection string is most likely to appear inside an
    // exception — a driver's own error carries the DSN it failed to open.
    const app = boot(() => {
      throw new Error("connect ECONNREFUSED postgres://user:pw@host/db");
    });

    const body = (await (await app.request("/api/health")).json()) as {
      error: { message: string };
    };
    expect(body.error.message).toBe("Something failed unexpectedly.");
    expect(body.error.message).not.toContain("postgres://");
  });

  test("a build that succeeds is passed through untouched", async () => {
    const built = new Hono();
    built.get("/api/health", (context) => context.json({ ok: true }));
    expect(boot(() => built)).toBe(built);
  });
});
