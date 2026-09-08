import { describe, expect, test } from "bun:test";
import { AuteurError } from "./auteur-error.ts";
import { ERROR_CODES, type ErrorCode, STATUS_BY_CODE } from "./error-code.ts";
import { isAuteurError } from "./is-auteur-error.ts";
import { toHttpResponse } from "./to-http-response.ts";

describe("the taxonomy is closed and total", () => {
  test.each(ERROR_CODES.map((code) => [code] as const))(
    "%s maps to exactly one status",
    (code) => {
      expect(STATUS_BY_CODE[code]).toBeGreaterThanOrEqual(400);
    },
  );

  test("every mapped code is in the taxonomy, and every code is mapped", () => {
    expect(Object.keys(STATUS_BY_CODE).sort()).toEqual([...ERROR_CODES].sort());
  });

  test("schema_violation is 502, not 500", () => {
    // The call succeeded and the output was wrong. That is a prompt or schema
    // bug, fixed in a different file from a gateway failure, and folding it
    // into `internal` would hide which.
    expect(STATUS_BY_CODE.schema_violation).toBe(502);
    expect(STATUS_BY_CODE.provider_error).toBe(502);
  });
});

describe("toHttpResponse never forwards an unexpected message", () => {
  const secret = "postgres://user:hunter2@db.example.com/auteur";

  test.each([
    ["a bare Error", new Error(secret)],
    ["a TypeError", new TypeError(secret)],
    ["a thrown string", secret],
    ["a thrown object", { message: secret }],
    ["null", null],
  ])("%s becomes internal with a fixed message", (_label, thrown) => {
    const { body, status } = toHttpResponse(thrown);
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal");
    expect(body.error.message).not.toContain("hunter2");
    expect(body.error.message).toBe("Something failed unexpectedly.");
  });

  test("an Error whose name was set to AuteurError but has no code is refused", () => {
    // The shape check is `name` *and* a code from the taxonomy. Name alone
    // would let any error launder its message through by assignment.
    const impostor = new Error(secret);
    impostor.name = "AuteurError";
    expect(isAuteurError(impostor)).toBe(false);
    expect(toHttpResponse(impostor).body.error.message).not.toContain(
      "hunter2",
    );
  });
});

describe("toHttpResponse forwards an AuteurError", () => {
  test.each(ERROR_CODES.map((code) => [code] as const))(
    "%s keeps its code, status and message",
    (code) => {
      const error = new AuteurError(code, "a message written for a reader");
      const { body, status } = toHttpResponse(error);
      expect(status).toBe(STATUS_BY_CODE[code]);
      expect(body.error.code).toBe(code);
      expect(body.error.message).toBe("a message written for a reader");
    },
  );

  test("detail is never in the response body", () => {
    // detail is where a provider's raw response goes. It belongs in a log.
    const error = new AuteurError("provider_error", "The gateway failed.", {
      detail: { rawResponse: "hunter2" },
    });
    expect(JSON.stringify(toHttpResponse(error).body)).not.toContain("hunter2");
    expect(error.detail).toEqual({ rawResponse: "hunter2" });
  });

  test("cause is preserved for the log without reaching the response", () => {
    const cause = new Error("the socket closed");
    const error = new AuteurError("provider_error", "The gateway failed.", {
      cause,
    });
    expect(error.cause).toBe(cause);
    expect(JSON.stringify(toHttpResponse(error).body)).not.toContain("socket");
  });
});

describe("isAuteurError survives a duplicated module instance", () => {
  test("a structurally identical error from another realm is recognised", () => {
    // Bun's test runner, the bundler and the dev server can each load a package
    // through a different module instance; `instanceof` fails across that
    // boundary and would send a real AuteurError down the `internal` path,
    // replacing a message written for a reader with a generic one.
    const fromElsewhere = new Error("The gateway failed.");
    fromElsewhere.name = "AuteurError";
    (fromElsewhere as Error & { code: ErrorCode }).code = "provider_error";

    expect(isAuteurError(fromElsewhere)).toBe(true);
    expect(toHttpResponse(fromElsewhere).status).toBe(502);
  });
});
