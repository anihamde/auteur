import type { ResponseOf } from "@auteur/api-contract/contract";
import { COPY } from "@auteur/copy/index";
import type { Session, Step } from "@auteur/core/session";
import { AuteurError } from "@auteur/errors/auteur-error";
import type { SessionState, Transport } from "../shell/session-state.ts";
import { demoCard } from "./card.ts";
import { RECORDED_LOG, RECORDED_SESSION_ID } from "./recorded-log.ts";

/**
 * Demo mode's transport: **zero network requests**, and every screen reachable.
 *
 * Not "requests that fail gracefully". The point is a client someone can open
 * with no server, and a failed request is a spinner that never resolves. A
 * fetch spy asserts the count is zero, which is a claim about behaviour rather
 * than about the code someone read.
 *
 * The session lives in memory here rather than in the app, because the app must
 * not know it is in a demo. A `if (demo)` branch in a screen is a branch that
 * is only exercised in the demo, which is the opposite of what a demo is for —
 * what a reader looks at has to be the same code the deploy runs.
 *
 * A route with nothing recorded still throws. A demo that silently answered
 * `{}` would teach a reader that the product does nothing.
 */

const OUTLINE = {
  beats: [
    {
      index: 1,
      text: "The lamp turns. He counts the seconds between sweeps, as he has since he was nine.",
    },
    {
      index: 2,
      text: "A letter arrives from the mainland. He does not open it for two days.",
    },
    {
      index: 3,
      text: "The bell rings the hours whether or not anyone counts them.",
    },
    {
      index: 4,
      text: "He walks to the head of the path, and stops where his father stopped.",
    },
  ],
  title: "Landfall",
};

const STORY = [
  "The lamp turned through the fog, and he counted, as he had counted since he was nine, the seconds between one sweep and the next.",
  "",
  "A letter came from the mainland on the Thursday boat. He set it on the shelf beside the barometer and did not open it for two days, and in that time he thought about it more than he had thought about anything since the winter.",
  "",
  "The bell rang the hours whether or not anyone counted them. That was the thing about the bell.",
  "",
  "On the third morning he walked as far as the head of the path, to the place where the grass gives out and the shingle starts, and he stopped there, which was where his father had stopped, and he went back up to the light.",
].join("\n");

const session = (step: Step): Session => ({
  authorId: "gutenberg:chekhov-anton-pavlovich-1860",
  cardId: "01a07f00-0000-7000-8000-0000000000ca",
  constraints: null,
  createdAt: new Date(1_770_000_000_000),
  id: RECORDED_SESSION_ID,
  idea: "a lighthouse keeper who has never seen the sea",
  lengthPreset: "flash",
  step,
  updatedAt: new Date(1_770_000_600_000),
});

const CARD = demoCard();

const viewAt = (step: Step): ResponseOf<"session"> => ({
  answers: [],
  card: CARD,
  decisions: [
    {
      decision: "Third person limited, past tense",
      origin: "model chose — not asked",
      reason:
        "No question covered point of view, and the card's measured voice is third limited.",
    },
    {
      decision: "The sea is never described directly",
      origin: "you answered",
      reason: "You chose 'Only at the end' when asked whether he ever sees it.",
    },
  ],
  outline: OUTLINE,
  report: null,
  session: session(step),
  story: { markdown: STORY, title: "Landfall", wordCount: 148 },
});

/**
 * The state a demo mounts with: a **finished** session, and its recorded events.
 *
 * `result`, not a step mid-run. The rail refuses forward navigation — pending
 * steps are not clickable, because a rail that promised a jump the pipeline
 * cannot honour would be lying — so a demo that started at `research` could
 * only ever show three of the seven screens. Starting at the end makes every
 * one of them reachable backwards, which is what a demo is for.
 */
export const demoState = (): SessionState => ({
  error: undefined,
  events: RECORDED_LOG,
  view: viewAt("result"),
});

export const demoTransport = (): Transport => {
  // The one piece of mutable state, so the rail can move between steps. It is
  // the same `patchSession` call the deploy makes; only the answer is local.
  let step: Step = "result";

  return {
    client: {
      call: async (
        name: string,
        options?: { body?: { to?: Step; step?: Step } },
      ) => {
        if (name === "session") return viewAt(step);
        if (name === "patchSession") {
          step = options?.body?.step ?? step;
          return viewAt(step).session;
        }
        if (name === "advance") return { enqueued: [] };
        if (name === "exportStory") {
          // The document the demo's story would export to, assembled here
          // rather than by `renderExport` — the demo runs in the browser and
          // the renderer is a server package, so importing it would put the
          // report and the decisions renderers into the client bundle to
          // produce four lines. The label is what §7.6 requires of an export
          // and it is the part that must not be approximated.
          return [
            "# Landfall",
            "",
            STORY,
            "",
            "---",
            "",
            COPY.result.attribution.replace("{author}", "Anton Chekhov"),
            "",
          ].join("\n");
        }
        throw new AuteurError(
          "not_found",
          `Demo mode has no recorded answer for ${name}.`,
        );
      },
    } as unknown as Transport["client"],
    openStream: (_sessionId, cursor, onEvent) => {
      // Replayed from the cursor, like the real one — so a demo that reloads
      // does not deliver the log twice.
      for (const event of RECORDED_LOG) {
        if (event.seq > cursor) onEvent(event);
      }
      return {
        close: () => undefined,
        cursor: () => RECORDED_LOG.at(-1)?.seq ?? 0,
        done: Promise.resolve(),
      };
    },
  };
};
