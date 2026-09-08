import { AuteurError } from "@auteur/errors/auteur-error";
import type { ModelDescriptor } from "@auteur/model-provider/descriptor";
import type {
  ModelProvider,
  ProviderEvent,
} from "@auteur/model-provider/provider";
import type { ModelRequest } from "@auteur/model-provider/request";
import OpenAI from "openai";
import { CATALOGUE, toDescriptor } from "./models.ts";
import { asAuteurError, ROUTER_PROVIDER_ID } from "./provider-errors.ts";
import { toResponsesRequest } from "./responses-request.ts";
import { toProviderEvents } from "./responses-stream.ts";

/**
 * The Ramp Router adapter.
 *
 * One gateway, one wire format, one place that knows either. Everything above
 * this file sees `ModelProvider` and nothing else, which is what lets the whole
 * pipeline be tested against a scripted fake with no network.
 */

/** The part of the SDK this adapter uses. Injected so tests replay bytes. */
export type RouterClient = Pick<OpenAI, "responses">;

export type RouterConfig = {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  /** For tests: an SDK instance with a replaying `fetch`. */
  readonly client?: RouterClient;
};

const DEFAULT_BASE_URL = "https://api.router.com/v1";

export const createRouterProvider = (config: RouterConfig): ModelProvider => {
  const client: RouterClient =
    config.client ??
    new OpenAI({
      apiKey: config.apiKey ?? "",
      baseURL: config.baseUrl ?? DEFAULT_BASE_URL,
      // Retries are the caller's: a stage that failed has a queue row and an
      // attempt count, and the SDK retrying underneath would spend the budget
      // without the queue ever seeing it.
      maxRetries: 0,
    });

  const models = (): readonly ModelDescriptor[] =>
    CATALOGUE.map((row) => toDescriptor(row));

  async function* stream(
    request: ModelRequest,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    try {
      const response = await client.responses.create(
        toResponsesRequest(request),
        { signal },
      );
      const finished = yield* toProviderEvents(response, config.apiKey);
      if (!finished) {
        // The stream ended with no terminal event. If the caller aborted, that
        // is what it asked for and the pipeline already knows; otherwise the
        // connection was cut mid-turn, and reporting it as a normal end would
        // record a truncated stage as a complete one.
        if (signal.aborted) {
          yield {
            error: new AuteurError("cancelled", "The session was cancelled."),
            type: "error",
          };
          return;
        }
        yield {
          error: new AuteurError(
            "provider_error",
            "The model gateway closed the stream before the response finished.",
            { detail: { provider: ROUTER_PROVIDER_ID } },
          ),
          type: "error",
        };
      }
    } catch (thrown) {
      // Terminal `error` rather than a throw: the deltas already yielded are
      // real, and the failure is part of the same sequence rather than an
      // unwinding of it.
      yield { error: asAuteurError(thrown, config.apiKey), type: "error" };
    }
  }

  return { id: ROUTER_PROVIDER_ID, models, stream };
};
