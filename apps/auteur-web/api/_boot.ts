import { toHttpResponse } from "@auteur/errors/to-http-response";
import { Hono } from "hono";

/**
 * Construct the app, or an app that says why it could not be constructed.
 *
 * The entry point builds everything at module scope: `env()`, two database
 * handles, a provider client. That is right — it happens once per instance
 * rather than once per request — and it means a single missing variable throws
 * during import, before any route exists. The platform answers that with
 * `FUNCTION_INVOCATION_FAILED` and a crash page, and the reason is in a log
 * somebody has to go and find.
 *
 * So the throw is caught and turned into the response it would have been if a
 * route had thrown it. `env()` already names **every** missing or malformed
 * variable rather than the first, and never echoes a value — so what a caller
 * sees is the list of keys to fix, which is exactly what the person looking at
 * the crash page needs and no more than `.env.example` already says out loud.
 *
 * Anything that is not an `AuteurError` goes through the same mapping, which
 * replaces its message with a fixed one: an unexpected throw during boot is
 * the most likely place for a connection string to appear in an exception.
 */
export const boot = (build: () => Hono): Hono => {
  try {
    return build();
  } catch (error) {
    const { body, status } = toHttpResponse(error);
    const app = new Hono();
    // Every path, every method. There is no route that could work.
    app.all("*", (context) => context.json(body, status as 500));
    return app;
  }
};
