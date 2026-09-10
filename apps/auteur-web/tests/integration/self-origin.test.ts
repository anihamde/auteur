import { describe, expect, test } from "bun:test";
import { selfOriginFrom } from "../../server/_internal/self-origin.ts";

/**
 * Which host a deployment asks to run its stages.
 *
 * It addressed `VERCEL_URL`, which standard Deployment Protection guards, so
 * every invocation on the deployment answered 401 while the same deployment
 * served the browser fine on its production alias.
 */

const DEPLOYMENT = "auteur-abc123-someone.vercel.app";
const ALIAS = "auteur-web-three.vercel.app";

describe("production addresses the alias, which has no protection wall", () => {
  test("the production alias wins over the per-deployment host", () => {
    expect(
      selfOriginFrom({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: ALIAS,
        VERCEL_URL: DEPLOYMENT,
      }),
    ).toBe(`https://${ALIAS}`);
  });

  test("a production deployment the platform names no alias for still addresses itself", () => {
    // Falling through to nothing would be a pipeline that stops rather than
    // one that needs the bypass secret.
    expect(
      selfOriginFrom({ VERCEL_ENV: "production", VERCEL_URL: DEPLOYMENT }),
    ).toBe(`https://${DEPLOYMENT}`);
  });
});

describe("a preview addresses itself", () => {
  test("preview takes its own host even though the alias is in the environment", () => {
    // Both variables are set on a preview. Taking the alias there would make
    // unreviewed code write production's rows.
    expect(
      selfOriginFrom({
        VERCEL_ENV: "preview",
        VERCEL_PROJECT_PRODUCTION_URL: ALIAS,
        VERCEL_URL: DEPLOYMENT,
      }),
    ).toBe(`https://${DEPLOYMENT}`);
  });
});

describe("empty is unset", () => {
  test("an empty alias does not become https:// with no host", () => {
    expect(
      selfOriginFrom({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "",
        VERCEL_URL: DEPLOYMENT,
      }),
    ).toBe(`https://${DEPLOYMENT}`);
  });

  test("no platform variables at all is a local dev server", () => {
    expect(selfOriginFrom({})).toBe("http://127.0.0.1:3000");
  });
});

describe("an explicit origin overrides the platform", () => {
  test("a custom domain is taken verbatim, protocol and all", () => {
    expect(
      selfOriginFrom({
        AUTEUR_SELF_ORIGIN: "https://auteur.example.com",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: ALIAS,
        VERCEL_URL: DEPLOYMENT,
      }),
    ).toBe("https://auteur.example.com");
  });
});

describe("a preview is isolated from production whatever else is set", () => {
  test("a preview ignores an override that names production", () => {
    // The platform's add-variable form selects Production, Preview and
    // Development by default, so the ordinary way to set this is the way that
    // points every preview's invocations at the production deployment.
    expect(
      selfOriginFrom({
        AUTEUR_SELF_ORIGIN: "https://auteur.example.com",
        VERCEL_ENV: "preview",
        VERCEL_PROJECT_PRODUCTION_URL: ALIAS,
        VERCEL_URL: DEPLOYMENT,
      }),
    ).toBe(`https://${DEPLOYMENT}`);
  });
});
