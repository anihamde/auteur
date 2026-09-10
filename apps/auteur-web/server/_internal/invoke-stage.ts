import { pathFor } from "@auteur/api-contract/contract";
import type { Fetch } from "@auteur/api-contract/transport";
import type { Logger } from "@auteur/logger/logger";
import { SIGNATURE_HEADER, signPayload } from "./signature.ts";

/**
 * Asking the platform to run one stage.
 *
 * This lived in `entry.ts`, which nothing imports and — until the tsconfig was
 * corrected — nothing type-checked either. It is here so it can be tested,
 * because the defect it carried was not visible in review and was invisible in
 * production too.
 */

/**
 * How long the calling instance stays alive after asking for a stage.
 *
 * Generous for what it covers — a request leaving inside one region, and a
 * rejection coming straight back — and far short of a stage. The cost of it
 * being too short is a refusal that goes unlogged; the cost of waiting for the
 * response was every caller dying with its successor.
 */
export const DISPATCH_GRACE_MS = 5_000;

/** `setTimeout` as a promise. `Bun.sleep` is not on the serverless path (gate 16). */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export type InvokeStageInput = {
  readonly sessionId: string;
  readonly stageId: string;
  readonly queueId: string;
};

export type InvokeStageDeps = {
  readonly origin: () => string;
  readonly stageSecret: () => string;
  readonly logger: Logger;
  /** Headers a protected deployment needs to reach itself. */
  readonly extraHeaders?: () => Readonly<Record<string, string>>;
  /**
   * The platform's "keep this instance alive until the promise settles".
   *
   * Injected rather than imported here so a test can assert the promise is
   * handed over — which is the whole property. Absent, the promise is left to
   * the runtime, which is correct for a `vite dev` that never freezes.
   */
  readonly waitUntil?: (promise: Promise<unknown>) => void;
  /**
   * How long the caller is held for. Overridden by a test that cannot wait.
   *
   * Milliseconds, and the default is `DISPATCH_GRACE_MS`.
   */
  readonly graceMs?: number;
  /** The timer, injectable so a test does not spend the grace period. */
  readonly delay?: (ms: number) => Promise<void>;
  /** `Fetch` rather than `typeof fetch`: the latter also demands `preconnect`. */
  readonly fetch?: Fetch;
};

/**
 * Ask for one stage, without waiting for it to finish.
 *
 * The caller must return before the stage runs (§7.1), and a stage's last act
 * is to ask for the next one — awaiting here would rebuild, one `await` at a
 * time, the long-running process the whole topology removed, and four nested
 * invocations would exceed `maxDuration` on the outermost.
 *
 * **The promise is handed to `waitUntil`, not dropped with `void`.** It was
 * dropped, and a serverless instance is frozen the moment its response is
 * written: the request was never sent. Not refused, not lost in flight — never
 * dispatched, so neither branch below ever ran and the logs showed nothing at
 * all. No stage this product ever ran was started by this function; every one
 * was started by hand, and the sweep, which calls the same function, could not
 * rescue it because it shared the defect. `_app.ts` states the rule this broke,
 * in a comment about why the sweep runs before the routes: work scheduled for
 * after the response is work that may never happen.
 *
 * **But it is handed a race, not the request.** `waitUntil` holds the instance
 * until the promise settles, and the callee does not answer until its stage is
 * finished — so a caller that waited for the response was alive for its own
 * stage *and* its successor's, against one 60-second ceiling. The deployment
 * showed it plainly: a `POST /api/internal/stage` that answered 200 and logged
 * `Task timed out after 60 seconds` in the same entry, because the stage
 * succeeded and the instance was then killed waiting on the next one. Two
 * stages billed to one invocation, and a pair of ordinary stages exceeding the
 * ceiling together while neither exceeded it alone.
 *
 * The grace period is what the instance is actually needed for: long enough for
 * the request to leave — a small POST inside one region — and for a refusal to
 * come back, since a 401 or a 500 arrives immediately. Not long enough to wait
 * out a stage. After it, the callee owns its own run and this instance has
 * nothing left to do.
 *
 * A lost request is still not a lost run: the queue row stays `queued` and the
 * sweep re-invokes it, which is why this does not retry into a stage that may
 * already be running.
 *
 * **It says so, though.** A failure that is systematic — every invocation
 * refused, rather than one lost — otherwise looks exactly like a pipeline that
 * is merely slow: the queue fills, the sweep re-invokes into the same refusal,
 * and nothing says why. A non-2xx is logged with its status, because "the
 * request was made and answered 401" is a different fact from "the request was
 * lost", and only one of them is what the sweep exists for.
 */
export const createInvokeStage =
  (deps: InvokeStageDeps) =>
  async (input: InvokeStageInput): Promise<void> => {
    const body = JSON.stringify({
      queueId: input.queueId,
      sessionId: input.sessionId,
      stageId: input.stageId,
    });
    const url = new URL(pathFor("internalStage", {}), deps.origin());
    const call: Fetch = deps.fetch ?? fetch;
    const dispatched = call(url.toString(), {
      body,
      headers: {
        "content-type": "application/json",
        ...deps.extraHeaders?.(),
        [SIGNATURE_HEADER]: signPayload(deps.stageSecret(), body),
      },
      method: "POST",
    })
      .then((response) => {
        if (!response.ok) {
          deps.logger.error("stage invocation refused", {
            stageId: input.stageId,
            status: response.status,
            url: url.origin,
          });
        }
      })
      .catch((error: unknown) => {
        deps.logger.error("stage invocation failed", {
          message: error instanceof Error ? error.message : "non-error thrown",
          stageId: input.stageId,
          url: url.origin,
        });
      });
    // Whichever comes first: the answer, or the end of the grace period. A
    // refusal answers well inside it and is logged; a stage that runs for a
    // minute is left to its own instance.
    const held =
      deps.graceMs === 0
        ? dispatched
        : Promise.race([
            dispatched,
            (deps.delay ?? sleep)(deps.graceMs ?? DISPATCH_GRACE_MS),
          ]);
    deps.waitUntil?.(held);
  };
