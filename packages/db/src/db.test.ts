import { describe, expect, test } from "bun:test";
import { withCurrentSslSemantics } from "./db.ts";

/**
 * The connection string, before `pg` sees it.
 *
 * Everything else this module does needs a server and lives under
 * `tests/integration/`. This one is a pure rewrite of a url, and it is the one
 * that decides whether the chain is verified after `pg` 9.
 */
describe("the deprecated SSL aliases are written as what they mean", () => {
  test("require becomes verify-full, which is what it already does", () => {
    // `pg` warns that in v9 these adopt libpq semantics, which do not verify
    // the chain. Writing the mode out keeps today's behaviour through that
    // bump instead of silently losing verification to a dependency upgrade.
    expect(
      withCurrentSslSemantics(
        "postgres://u:p@host/db?sslmode=require&channel_binding=require",
      ),
    ).toBe(
      "postgres://u:p@host/db?sslmode=verify-full&channel_binding=require",
    );
  });

  test("prefer and verify-ca too, since pg aliases all three", () => {
    for (const mode of ["prefer", "verify-ca"]) {
      expect(
        withCurrentSslSemantics(`postgres://h/d?sslmode=${mode}`),
      ).toContain("sslmode=verify-full");
    }
  });

  test("a mode this does not alias is left alone", () => {
    // `disable` is somebody's decision, not a deprecated spelling of another
    // mode. Rewriting it would be this function choosing a TLS policy.
    expect(withCurrentSslSemantics("postgres://h/d?sslmode=disable")).toBe(
      "postgres://h/d?sslmode=disable",
    );
    expect(withCurrentSslSemantics("postgres://h/d")).toBe("postgres://h/d");
  });

  test("a url this cannot parse is handed on untouched", () => {
    // `pg` accepts shapes `URL` does not. Rewriting is a convenience and must
    // never become a gate on connecting at all.
    expect(withCurrentSslSemantics("not a url")).toBe("not a url");
  });
});
