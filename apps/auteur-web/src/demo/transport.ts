import { AuteurError } from "@auteur/errors/auteur-error";
import type { Transport } from "../shell/session-state.ts";
import { RECORDED_LOG } from "./recorded-log.ts";

/**
 * Demo mode's transport: **zero network requests**.
 *
 * Not "requests that fail gracefully". The point is a client someone can open
 * with no server, and a failed request is a spinner that never resolves. A
 * fetch spy asserts the count is zero, which is a claim about behaviour rather
 * than about the code someone read.
 *
 * Every route that has no recorded answer throws rather than returning an empty
 * one: a demo that silently answers `{}` teaches a reader that the product does
 * nothing.
 */
export const demoTransport = (): Transport => ({
  client: {
    call: async (name: string) => {
      throw new AuteurError(
        "not_found",
        `Demo mode has no recorded answer for ${name}.`,
      );
    },
  } as unknown as Transport["client"],
  openStream: (_sessionId, _cursor, onEvent) => {
    for (const event of RECORDED_LOG) {
      onEvent(event);
    }
    return {
      close: () => undefined,
      cursor: () => RECORDED_LOG.at(-1)?.seq ?? 0,
      done: Promise.resolve(),
    };
  },
});
