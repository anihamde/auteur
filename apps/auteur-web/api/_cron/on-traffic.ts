import { claimSweep, SWEEP_EVERY_SECONDS } from "@auteur/stage-queue/sweep";
import type { MiddlewareHandler } from "hono";
import { type SweepDeps, sweep } from "./sweep.ts";

/**
 * The sweep, driven by traffic rather than by the scheduler.
 *
 * The scheduler is the wrong primary trigger on this platform: a Hobby project
 * is allowed one cron firing a day, so a run that stalls at two in the
 * afternoon would resume tomorrow morning. The cron entry stays as a backstop
 * for a deployment nobody is using; this is what recovers a stalled run while
 * someone is watching it.
 *
 * **Every request is a candidate, one request in the window actually sweeps.**
 * `claimSweep` is a conditional update, so the throttle lives in the database
 * where instances can see it — an in-memory timestamp would be one per
 * function instance, which on a platform that runs instances in parallel is no
 * throttle at all.
 *
 * It runs *before* the handler rather than after. A serverless instance may be
 * frozen the moment its response is written, so work scheduled for afterwards
 * is work that may never happen.
 */
export type OnTrafficDeps = Omit<SweepDeps, "staleAfterSeconds"> & {
  readonly staleAfterSeconds?: number;
  readonly queuedAfterSeconds?: number;
  /** Overridden by a test that cannot wait thirty seconds. */
  readonly everySeconds?: number;
  readonly onError?: (error: unknown) => void;
};

export const sweepOnTraffic = (deps: OnTrafficDeps): MiddlewareHandler =>
  async function sweepMiddleware(context, next) {
    // `/internal/*` is the sweep's own path and the stage route it invokes.
    // Sweeping from there would let a sweep trigger a sweep, and would put the
    // work in front of the one request whose latency is a stage's latency.
    if (context.req.path.startsWith("/internal/")) return next();

    try {
      if (await claimSweep(deps.db, deps.everySeconds ?? SWEEP_EVERY_SECONDS)) {
        await sweep(deps);
      }
    } catch (error) {
      // A failed sweep must not fail the request that happened to trigger it.
      // The request is somebody's; the sweep is nobody's, and there will be
      // another one along in thirty seconds.
      deps.onError?.(error);
    }
    return next();
  };
