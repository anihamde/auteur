import { ROUTES } from "@auteur/api-contract/routes";
import type { Fetch } from "@auteur/api-contract/transport";
import { AuteurError } from "@auteur/errors/auteur-error";
import { Hono } from "hono";

/**
 * `GET /api/internal/corpus-probe` — **temporary.** Which corpus hosts can
 * this network reach?
 *
 * Search fails from the functions and succeeds from a laptop, so the
 * difference is the network. The catalogue and the book text live on two
 * different hosts, and whether the second is reachable decides between holding
 * the catalogue locally and proxying everything. Nothing in the pipeline can
 * find out: `work-fetch` runs after `corpus-select`, which is the stage that
 * fails.
 *
 * It takes no input and reaches two fixed urls. Every attempt is bounded, and
 * an outcome is one of four words rather than an exception — the point is to
 * come back with an answer even when the answer is silence.
 *
 * **Delete this once the answer is in a decision record.** A diagnostic that
 * outlives its question is a route nobody can explain.
 */

const TIMEOUT_MS = 8000;

/** The two hosts, and a url on each that a healthy network answers. */
export const PROBE_TARGETS = [
  {
    host: "gutendex.com",
    url: "https://gutendex.com/books/?search=chekhov&languages=en",
  },
  {
    // Frankenstein. A small, always-present text: if any book downloads, this
    // one does.
    host: "gutenberg.org",
    url: "https://www.gutenberg.org/ebooks/84.txt.utf-8",
  },
] as const;

export type ProbeOutcome = {
  readonly host: string;
  readonly detail: string;
  readonly ms: number;
  readonly outcome: "ok" | "refused" | "timeout" | "error";
  readonly status: number | null;
};

/** Enough of a body to recognise a block page by. */
const DETAIL_LIMIT = 200;

export const probeOne = async (
  target: { readonly host: string; readonly url: string },
  fetchImpl: Fetch = fetch,
  timeoutMs = TIMEOUT_MS,
): Promise<ProbeOutcome> => {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  try {
    const response = await fetchImpl(target.url, {
      headers: {
        "user-agent": "auteur/0.1 (+https://github.com/anihamde/auteur)",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await response.text().catch(() => "")).slice(0, DETAIL_LIMIT);
    return {
      detail: response.ok
        ? `${body.length.toString()} bytes read`
        : `${response.headers.get("server") ?? "?"} · ${body}`,
      host: target.host,
      ms: elapsed(),
      outcome: response.ok ? "ok" : "refused",
      status: response.status,
    };
  } catch (thrown) {
    const timedOut =
      thrown instanceof Error &&
      (thrown.name === "TimeoutError" || thrown.name === "AbortError");
    return {
      detail: thrown instanceof Error ? thrown.message : "non-error thrown",
      host: target.host,
      ms: elapsed(),
      outcome: timedOut ? "timeout" : "error",
      status: null,
    };
  }
};

export type CorpusProbeDeps = {
  /** The same secret the sweep carries: this is not a route a browser calls. */
  readonly cronSecret: string;
  readonly fetch?: Fetch;
};

const constantTimeEqual = (left: string, right: string): boolean => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

export const corpusProbeRoutes = (deps: CorpusProbeDeps): Hono => {
  const routes = new Hono();

  routes.get(ROUTES.corpusProbe.path, async (context) => {
    const header = context.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!constantTimeEqual(token, deps.cronSecret)) {
      throw new AuteurError(
        "unauthorized",
        "This request does not carry the scheduler's token.",
      );
    }

    // Sequential, not parallel: two requests at once to a network that may be
    // rate-limiting is the way to turn a clean answer into a confusing one.
    const results: ProbeOutcome[] = [];
    for (const target of PROBE_TARGETS) {
      results.push(await probeOne(target, deps.fetch));
    }
    return context.json({ results });
  });

  return routes;
};
