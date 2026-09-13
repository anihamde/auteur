import { createClient } from "@auteur/api-client/client";
import type { ResponseOf } from "@auteur/api-contract/contract";
import type { StoredEvent } from "@auteur/core/events";
import type { Step } from "@auteur/core/session";
import {
  connectStream,
  type Stream,
} from "@auteur/stream-client/stream-client";

/**
 * The client's whole model of a session.
 *
 * One `SessionView` and one event log, because that is what the server offers:
 * `GET /api/sessions/:id` returns everything a reload needs in one response
 * (§7.1), and the stream appends to it. A client that kept a slice per screen
 * would have seven things to keep current and seven chances to be stale.
 */

export type SessionView = ResponseOf<"session">;

export type SessionState = {
  readonly view: SessionView | undefined;
  readonly events: readonly StoredEvent[];
  readonly error: string | undefined;
};

export const EMPTY: SessionState = {
  error: undefined,
  events: [],
  view: undefined,
};

/**
 * The lines a stage has streamed, oldest first — its progress and, last, why it
 * stopped.
 *
 * A failure was a red dot and nothing else: the reason existed, in an event the
 * screen already had, and no screen read it. Reading it here rather than in a
 * separate failure slot is what puts the reason where the reader is already
 * looking.
 */
export const detailFor = (
  events: readonly StoredEvent[],
  stageId: string,
): string[] =>
  events.flatMap((stored) => {
    const event = stored.event;
    if (!("stageId" in event) || event.stageId !== stageId) return [];
    if (event.type === "stage_detail") return [event.line];
    if (event.type === "stage_error") {
      return [
        event.detail === undefined
          ? event.message
          : `${event.message} ${event.detail}`,
      ];
    }
    return [];
  });

/** What the pipeline is doing to a stage right now. */
export const stateFor = (
  events: readonly StoredEvent[],
  stageId: string,
): "pending" | "running" | "done" | "failed" => {
  let state: "pending" | "running" | "done" | "failed" = "pending";
  for (const stored of events) {
    const event = stored.event;
    if (!("stageId" in event) || event.stageId !== stageId) continue;
    if (event.type === "stage_start") state = "running";
    if (event.type === "stage_end") state = "done";
    if (event.type === "stage_error") state = "failed";
  }
  return state;
};

export type Transport = {
  readonly client: ReturnType<typeof createClient>;
  readonly openStream: (
    sessionId: string,
    cursor: number,
    onEvent: (event: StoredEvent) => void,
  ) => Stream;
};

/**
 * The live transport: the generated client, and the SSE reader.
 *
 * Demo mode substitutes a different `Transport` rather than adding a branch to
 * every screen — which is what makes "zero network requests" assertable by a
 * fetch spy instead of by reading the code.
 */
export const liveTransport = (baseUrl: string, token: string): Transport => {
  const client = createClient({
    baseUrl,
    fetch: async (url, init) =>
      fetch(url, {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string> | undefined),
          authorization: `Bearer ${token}`,
        },
      }),
  });
  return {
    client,
    openStream: (sessionId, cursor, onEvent) =>
      connectStream({
        fetch: async (url, init) =>
          fetch(url, {
            ...init,
            headers: { authorization: `Bearer ${token}` },
          }),
        onEvent,
        onFatal: () => undefined,
        startCursor: cursor,
        url: `${baseUrl}/api/sessions/${sessionId}/events`,
      }),
  };
};

/** Which step the rail should highlight, from the session row. */
export const STEP_ORDER: readonly Step[] = [
  "idea",
  "author",
  "research",
  "clarify",
  "outline",
  "story",
  "result",
];

export const stepIndex = (step: Step): number => STEP_ORDER.indexOf(step);
