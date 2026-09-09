import { afterAll, describe, expect, test } from "bun:test";
import { errorResponseSchema, ROUTES } from "@auteur/api-contract/routes";
import { createDb } from "@auteur/db/db";
import { AuteurError } from "@auteur/errors/auteur-error";
import { createApp } from "../../server/_app.ts";

const TOKEN = "a-token-of-at-least-16-chars";

// Never connected: every route under test here answers without a query, and
// `createDb` opens nothing until one is issued. A route that does touch the
// database is tested against a real server under `tests/integration/`.
const db = createDb({ endpoint: "pooled", url: "postgres://unused/unused" });
afterAll(async () => {
  await db.close();
});

const app = createApp({ apiToken: TOKEN, db });

/**
 * `null` means no `Authorization` header at all.
 *
 * Not `undefined`: a default parameter treats an explicitly passed `undefined`
 * as absent, so `get(path, undefined)` would silently send the good token and
 * every unauthenticated case would pass while testing nothing.
 */
const get = async (
  path: string,
  token: string | null = TOKEN,
): Promise<Response> =>
  app.request(path, {
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
  });

describe("GET /api/health", () => {
  test("it answers without a token", async () => {
    // The one unauthenticated route. A probe that must authenticate reports
    // the token's health rather than the service's.
    const response = await get(ROUTES.health.path, null);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("the response parses as the contract says it does", async () => {
    const response = await get(ROUTES.health.path, null);
    expect(ROUTES.health.response.parse(await response.json())).toEqual({
      ok: true,
    });
  });
});

describe("GET /api/models", () => {
  test("every stage appears, and the deterministic ones carry no model", async () => {
    // A stage with no tier runs no model at all. `modelId: null` says so;
    // omitting the row would read as a gap in the pipeline.
    const response = await get(ROUTES.models.path);
    expect(response.status).toBe(200);
    const body = ROUTES.models.response.parse(await response.json());
    expect(body.stages.map((stage) => stage.stageId)).toContain("draft");
    const measure = body.stages.find(
      (stage) => stage.stageId === "prosody-compute",
    );
    expect(measure?.modelId).toBeNull();
    expect(measure?.tier).toBeNull();
  });

  test("every tiered stage resolves to a model in the catalogue", async () => {
    const response = await get(ROUTES.models.path);
    const body = ROUTES.models.response.parse(await response.json());
    const ids = new Set(body.models.map((model) => model.id));
    const tiered = body.stages.filter((stage) => stage.tier !== null);
    expect(tiered.length).toBeGreaterThan(0);
    for (const stage of tiered) {
      expect(ids.has(stage.modelId ?? "")).toBe(true);
    }
  });

  test("no pin is claimed, because this route has no session", async () => {
    const response = await get(ROUTES.models.path);
    const body = ROUTES.models.response.parse(await response.json());
    expect(body.stages.every((stage) => !stage.pinned)).toBe(true);
  });
});

describe("the bearer token guards everything but health", () => {
  test("a missing token is 401, not 200", async () => {
    const response = await get(ROUTES.models.path, null);
    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe(
      "unauthorized",
    );
  });

  test("a wrong token of the same length is refused", async () => {
    // The comparison is constant-time, so this case exists to prove it still
    // refuses — a bug in that loop would accept everything, not just this.
    const response = await get(
      ROUTES.models.path,
      "b-token-of-at-least-16-chars",
    );
    expect(response.status).toBe(401);
  });

  test("the refusal does not say whether a token was presented", async () => {
    const absent = await get(ROUTES.models.path, null);
    const wrong = await get(ROUTES.models.path, "b-token-of-at-least-16-chars");
    expect(await absent.json()).toEqual(await wrong.json());
  });
});

describe("a thrown failure becomes the contract's error shape", () => {
  test("invalid input is 400 carrying the code, never a 200 with an error in it", async () => {
    // §7.4 and the http-api rule: a 200 carrying `{ error }` breaks every
    // client's retry and monitoring.
    const throwing = createApp({ apiToken: TOKEN, db });
    throwing.get("/api/probe", () => {
      throw new AuteurError(
        "invalid_input",
        "The cursor must not be negative.",
      );
    });
    const response = await throwing.request("/api/probe", {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(response.status).toBe(400);
    const body = errorResponseSchema.parse(await response.json());
    expect(body.error.code).toBe("invalid_input");
    expect(body.error.message).toBe("The cursor must not be negative.");
  });

  test("an unexpected throw does not forward its message", async () => {
    // The one case whose message was not written with a reader in mind: it can
    // carry a provider's raw response or a connection string.
    const throwing = createApp({ apiToken: TOKEN, db });
    throwing.get("/api/probe", () => {
      throw new Error("postgres://user:hunter2@host/db refused");
    });
    const response = await throwing.request("/api/probe", {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(response.status).toBe(500);
    const body = errorResponseSchema.parse(await response.json());
    expect(body.error.code).toBe("internal");
    expect(body.error.message).not.toContain("hunter2");
  });

  test("an unknown route is 404 in the same shape", async () => {
    const response = await get("/api/nothing-here");
    expect(response.status).toBe(404);
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe(
      "not_found",
    );
  });
});
