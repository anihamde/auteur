import { z } from "zod";

/**
 * The environment, described once.
 *
 * One schema rather than one per runtime: `docs/ARCHITECTURE.md` §7 resolved to
 * a single deploy unit, so there is one process shape and splitting the schema
 * would be describing a boundary that does not exist.
 *
 * The two database URLs are both required and are not interchangeable. §3.1:
 * almost every function opens the **pooled** endpoint, because instances are
 * plural and short-lived; the SSE route opens the **direct** one, because
 * `LISTEN` is a session-level feature that pooled-mode PgBouncer does not
 * support. Naming them separately is what lets a test assert that no route but
 * that one reads the direct URL.
 */
export const ENV_SPEC = {
  AUTEUR_API_TOKEN: {
    describe: "Shared bearer token every public route requires.",
    schema: z.string().min(16),
  },
  /**
   * What the platform's scheduler presents on the cron route.
   *
   * Vercel Cron invokes a path with **GET** and, when this variable is set,
   * `Authorization: Bearer <CRON_SECRET>`. It does not sign a body, so the
   * sweep cannot use `AUTEUR_STAGE_SECRET`'s HMAC the way `/internal/stage`
   * does — a scheduler that cannot produce the signature would simply never
   * fire, silently, which is the failure the sweep exists to prevent.
   *
   * Kept distinct from the stage secret anyway: the scheduler holds a value it
   * did not choose and cannot rotate, and giving it the key that drives the
   * pipeline would widen what a leak of it reaches.
   */
  AUTEUR_CRON_SECRET: {
    describe:
      "Bearer token the platform's scheduler presents on /internal/cron/sweep. Set the same value as Vercel's CRON_SECRET.",
    schema: z.string().min(16),
  },
  AUTEUR_STAGE_SECRET: {
    describe:
      "Secret for POST /internal/stage. Distinct from the API token so a browser holding the client's token cannot drive the pipeline directly.",
    schema: z.string().min(16),
  },
  DATABASE_URL: {
    describe: "Neon pooled endpoint. Used by every route but the SSE one.",
    schema: z.string().url(),
  },
  DATABASE_URL_DIRECT: {
    describe:
      "Neon direct endpoint. Used only by the SSE route, which holds a LISTEN connection for the life of the stream.",
    schema: z.string().url(),
  },
  RAMP_ROUTER_API_KEY: {
    describe: "Ramp Router credential for every model call.",
    schema: z.string().min(1),
  },
} as const satisfies Record<
  string,
  { readonly describe: string; readonly schema: z.ZodType }
>;

export type EnvKey = keyof typeof ENV_SPEC;

export const ENV_KEYS = Object.keys(ENV_SPEC) as readonly EnvKey[];
