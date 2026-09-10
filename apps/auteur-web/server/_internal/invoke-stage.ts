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
    deps.waitUntil?.(dispatched);
  };
