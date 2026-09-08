import type {
  ConformanceProvider,
  ConformanceScenario,
} from "@auteur/test-support/conformance";
import { runConformanceSuite } from "@auteur/test-support/conformance";
import { createRouterProvider } from "../../src/client.ts";
import {
  failing,
  hanging,
  networkFailure,
  readFixture,
  replaying,
  TEST_API_KEY,
  type Transport,
} from "../fixtures/replay.ts";

/**
 * The contract, asserted against this adapter.
 *
 * Everything vendor-shaped stays in the other two files here: what the request
 * body looks like, how the SDK's decoder behaves, which fixture is which. This
 * file only maps scenario names onto recordings.
 */

const PREFIX =
  'event: response.created\ndata: {"type":"response.created","sequence_number":1,"response":{"created_at":1,"error":null,"id":"r","incomplete_details":null,"instructions":null,"metadata":null,"model":"gpt-5","object":"response","output":[],"output_text":"","parallel_tool_calls":false,"status":"in_progress","temperature":1,"tool_choice":"auto","tools":[],"top_p":1}}\n\n';

const FIXTURE_BY_SCENARIO: Readonly<
  Partial<Record<ConformanceScenario, string>>
> = {
  "rate-limited": "mid-stream-rate-limit.sse",
  "stop-max-tokens": "truncated-max-tokens.sse",
  "stop-refusal": "refusal.sse",
  "text-turn": "text-turn.sse",
  "usage-cached": "usage-cached.sse",
};

const transportFor = async (
  scenario: ConformanceScenario,
): Promise<Transport> => {
  const fixture = FIXTURE_BY_SCENARIO[scenario];
  if (fixture !== undefined) return replaying(await readFixture(fixture));
  if (scenario === "model-unavailable") {
    return failing(404, await readFixture("model-not-found.json"));
  }
  if (scenario === "server-error") {
    return failing(500, await readFixture("server-error.json"));
  }
  if (scenario === "truncated") return networkFailure();
  throw new Error(`no recording for ${scenario}`);
};

const wrap = (transport: Transport): ConformanceProvider => ({
  provider: createRouterProvider({
    apiKey: TEST_API_KEY,
    client: transport.client,
  }),
  wasCancelled: transport.wasCancelled,
});

runConformanceSuite({
  hangingProvider: async () => wrap(hanging(PREFIX)),
  modelId: "gpt-5",
  name: "@auteur/provider-router",
  providerFor: async (scenario) => wrap(await transportFor(scenario)),
});
