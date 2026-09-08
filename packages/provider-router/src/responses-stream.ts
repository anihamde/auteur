import { AuteurError } from "@auteur/errors/auteur-error";
import type { ProviderEvent } from "@auteur/model-provider/provider";
import type { StopReason, Usage } from "@auteur/model-provider/request";
import type {
  ResponseOutputItem,
  ResponseStreamEvent,
  ResponseUsage,
} from "openai/resources/responses/responses";
import {
  asAuteurError,
  fromStreamError,
  ROUTER_PROVIDER_ID,
} from "./provider-errors.ts";

/**
 * The Responses API's event stream, as `ProviderEvent`s.
 *
 * Ported from nexus, with everything auteur has no surface for removed: no
 * tool calls, no reasoning carry-back, no server-side search. What is left is
 * text, a stop reason and usage — which is the whole of what a stage needs.
 *
 * ## The terminal event is the authority, not the stream
 *
 * `response.completed` and `response.incomplete` carry the whole `output` —
 * every item the turn produced, finished — so what the turn *decided* is read
 * from there rather than accumulated as it streams. That is not a preference:
 *
 * - A refusal is a `refusal` content part on the message item. It also arrives
 *   as `response.refusal.delta` events, but only when the provider chooses to
 *   stream it, and a turn refused without deltas would otherwise report
 *   `end_turn` — an answer that says nothing, recorded as a normal answer.
 * - An item type this adapter cannot handle is visible only by reading the
 *   output. Watching the deltas alone makes it invisible, and the turn stops
 *   `end_turn` with the item dropped.
 * - A `response.output_item.done` arriving *after* the terminal event would
 *   retroactively change the stop reason. Reading the terminal event's own
 *   output cannot.
 *
 * Text is taken from the deltas, because that is what streaming is for and the
 * terminal event's copy is the same string assembled.
 *
 * ## Where the stop reason comes from
 *
 * `response.incomplete` carries `incomplete_details.reason`, which is
 * `max_output_tokens` or `content_filter` — the second being a refusal by
 * another name. Everything else that completes is `end_turn`. There is no
 * `tool_use` to infer: auteur's stages send no tools.
 */

/**
 * A count the payload may not carry, whatever the type says.
 *
 * `ResponseUsage` marks `input_tokens_details` and its counts **required**, and
 * the SDK's stream decoder validates framing rather than payloads — so a
 * response missing them typechecks its way to a `TypeError` at run time, thrown
 * out of a generator whose whole contract is that it throws `AuteurError` and
 * nothing else. The type is the vendor's promise, not this system's guarantee,
 * and the distance between them is one crash.
 */
const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/**
 * Usage, from the terminal event's response.
 *
 * `Usage` requires the input counts to **partition** the call's input —
 * `inputTokens` meaning tokens billed at the normal rate — and this API reports
 * a total with a breakdown beside it: `input_tokens_details` is documented as
 * "a detailed breakdown of the input tokens", so `cached_tokens` is a subset of
 * `input_tokens` rather than a count alongside it. Copying the total across
 * would count the cached tokens twice, at the wrong rate, and nothing would
 * catch it until a bill.
 *
 * That reading is an inference from the SDK's wording rather than something
 * checked against a live response, which is why the test asserts the partition
 * as an invariant rather than asserting three numbers: if the relationship is
 * the other way round, the sum stops matching and the case says so.
 *
 * `Math.max(fresh, 0)` is a floor. A negative `inputTokens` is not a number
 * anyone should persist, and a breakdown exceeding its total would produce one.
 *
 * `output_tokens_details` is dropped. It carries reasoning tokens, which are a
 * subset of `output_tokens`: recording them would need a contract change, and
 * folding them into `outputTokens` would double-count.
 */
const fromResponseUsage = (usage: ResponseUsage | undefined): Usage => {
  const cached = count(usage?.input_tokens_details?.cached_tokens);
  const total = count(usage?.input_tokens);
  return {
    cachedInputTokens: cached,
    inputTokens: Math.max(total - cached, 0),
    outputTokens: count(usage?.output_tokens),
  };
};

/**
 * What the turn's output held, read off the terminal event.
 *
 * Anything this adapter did not ask for is an error rather than a silent drop.
 * A dropped item leaves a turn that tried to do something, stopped `end_turn`,
 * and looks exactly like a turn that answered.
 */
const readRefusal = (items: readonly ResponseOutputItem[]): boolean => {
  let refused = false;
  for (const item of items) {
    switch (item.type) {
      case "message": {
        if (item.content.some((part) => part.type === "refusal")) {
          refused = true;
        }
        break;
      }
      case "reasoning": {
        break;
      }
      default: {
        throw new AuteurError(
          "provider_error",
          "The model returned something this stage cannot read.",
          {
            detail: {
              itemType: item.type,
              provider: ROUTER_PROVIDER_ID,
              reason:
                "The turn produced an output item with no canonical equivalent",
            },
          },
        );
      }
    }
  }
  return refused;
};

type Ending =
  | { readonly kind: "completed" }
  | { readonly kind: "incomplete"; readonly reason?: string };

const toStopReason = (ending: Ending, refused: boolean): StopReason => {
  if (refused) return "refusal";
  if (ending.kind === "incomplete") {
    return ending.reason === "content_filter" ? "refusal" : "max_tokens";
  }
  return "end_turn";
};

/**
 * Translate one Responses stream.
 *
 * Returns `true` when the turn finished — a terminal `ProviderEvent` was
 * yielded. `false` means the stream stopped early, and the caller decides
 * whether that was a truncated response or a cancellation it asked for. Errors
 * are thrown rather than yielded, so one place owns turning a failure into the
 * terminal `error` event.
 */
export async function* toProviderEvents(
  events: AsyncIterable<ResponseStreamEvent>,
  apiKey?: string,
): AsyncGenerator<ProviderEvent, boolean, undefined> {
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let ending: Ending | undefined;
  let refused = false;
  /**
   * The message item the last text delta belonged to.
   *
   * A Responses turn is a list of **items**, and a model routinely produces two
   * message items in one turn. Concatenating their deltas glues two sentences
   * that were never adjacent — a heading that a blank line would have opened
   * becomes two characters in the middle of a sentence. So a change of item is
   * a paragraph break, emitted as its own delta.
   */
  let textItem: string | undefined;

  // The iteration itself is wrapped, because this generator's contract is that
  // it throws `AuteurError` and nothing else — and the SDK's decoder throws for
  // an in-stream `error` frame, a severed socket and an abort alike. A raw
  // `APIError` escaping here would carry a vendor's wording into a product
  // surface; a raw `TypeError` would be an untyped 500.
  try {
    for await (const event of events) {
      switch (event.type) {
        case "response.output_text.delta": {
          if (event.delta.length > 0) {
            if (textItem !== undefined && textItem !== event.item_id) {
              yield { text: "\n\n", type: "text_delta" };
            }
            textItem = event.item_id;
            yield { text: event.delta, type: "text_delta" };
          }
          break;
        }
        case "response.completed": {
          usage = fromResponseUsage(event.response.usage);
          refused = readRefusal(event.response.output);
          ending = { kind: "completed" };
          break;
        }
        case "response.incomplete": {
          usage = fromResponseUsage(event.response.usage);
          refused = readRefusal(event.response.output);
          ending = {
            kind: "incomplete",
            ...(event.response.incomplete_details?.reason !== undefined && {
              reason: event.response.incomplete_details.reason,
            }),
          };
          break;
        }
        case "response.failed": {
          throw new AuteurError("provider_error", "The model gateway failed.", {
            detail: {
              provider: ROUTER_PROVIDER_ID,
              reason:
                event.response.error?.message ??
                "The provider reported the response failed",
            },
          });
        }
        case "error": {
          // Classified rather than wrapped. This API can fail after its 200, and
          // the frame's `code` is the only signal there is — a rate limit
          // recorded as a model failure would be indistinguishable from one, and
          // the two want opposite responses.
          throw fromStreamError(event, apiKey);
        }
        default: {
          break;
        }
      }
    }
  } catch (thrown) {
    throw asAuteurError(thrown, apiKey);
  }

  if (ending === undefined) {
    // The stream stopped without a terminal event. A truncated turn keeps the
    // text it had; the caller decides what that means.
    return false;
  }

  yield { reason: toStopReason(ending, refused), type: "stop", usage };
  return true;
}
