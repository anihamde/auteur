import type { AuteurError } from "@auteur/errors/auteur-error";
import type { ModelDescriptor } from "./descriptor.ts";
import type { ModelRequest, StopReason, Usage } from "./request.ts";

/**
 * The one stream vocabulary every provider adapter emits.
 *
 * A provider's job is to turn its own wire stream into exactly these events.
 * The pipeline consumes them and never learns which adapter it is talking to,
 * which is what lets every stage be tested against a scripted fake.
 *
 * `stop` and `error` are terminal: an adapter emits exactly one of them, last.
 * `error` is an event rather than a thrown exception because the stream is an
 * `AsyncIterable` the caller is partway through consuming — the deltas already
 * yielded are real, and the failure is part of the same sequence rather than an
 * unwinding of it.
 */
export type ProviderEvent =
  | { readonly type: "text_delta"; readonly text: string }
  | {
      readonly type: "stop";
      readonly reason: StopReason;
      readonly usage: Usage;
    }
  | { readonly type: "error"; readonly error: AuteurError };

export type ModelProvider = {
  /**
   * Stable identifier, unique across registered providers, and the value every
   * one of this provider's `ModelDescriptor.providerId` fields carries.
   */
  readonly id: string;

  /**
   * The models this provider offers, in panel order. Called once, at
   * registration: what a provider offers is a function of how it was
   * configured, not of when it is asked.
   */
  readonly models: () => readonly ModelDescriptor[];

  /**
   * Run one stage's call, yielding events as they arrive.
   *
   * Aborting `signal` ends the iteration promptly. That is how a cancelled
   * session reaches the provider — the cancel flag is read at stage
   * boundaries, and this is what handles the stage already in flight.
   */
  readonly stream: (
    request: ModelRequest,
    signal: AbortSignal,
  ) => AsyncIterable<ProviderEvent>;
};
