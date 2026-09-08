import type { ModelRequest } from "@auteur/model-provider/request";
import type { ResponseCreateParamsStreaming } from "openai/resources/responses/responses";

/**
 * A stage's request, in the Responses API's shape.
 *
 * Far smaller than nexus's builder, because auteur sends no conversation and no
 * tools. A stage has a system prompt, one rendered input, a token ceiling and —
 * for six of the seven model stages — a schema.
 *
 * **`instructions` for the system prompt**, which is the Responses API's own
 * field for it rather than a `role: "system"` item.
 *
 * **`max_output_tokens`**, not `max_completion_tokens`. It is the field this
 * API names, and it is the ceiling `ModelDescriptor.maxOutputTokens` is
 * measured against.
 *
 * **`store: false`, which Chat Completions never had to say.** The Responses
 * API stores the response for later retrieval **by default**. Nothing here
 * retrieves a past response, and a stage's input carries the user's idea and
 * an author's prose; storing it at the gateway would be a copy this system
 * neither manages nor needs.
 *
 * **The one branch is `format`** (`ARCHITECTURE.md` §6.4): present, it sets
 * `text.format` to a strict `json_schema`. That is the whole of the
 * structured-output work.
 */
export const toResponsesRequest = (
  request: ModelRequest,
): ResponseCreateParamsStreaming => ({
  input: request.input,
  instructions: request.system,
  max_output_tokens: request.maxTokens,
  model: request.modelId,
  store: false,
  stream: true,
  ...(request.format !== undefined && {
    text: {
      format: {
        name: request.format.name,
        schema: request.format.schema,
        strict: true,
        type: "json_schema",
      },
    },
  }),
});
