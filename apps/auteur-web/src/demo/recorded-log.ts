import type { StoredEvent } from "@auteur/core/events";

/**
 * A recorded run, for demo mode and for the screens' tests.
 *
 * One log, used twice on purpose: R5's test renders the research screen from
 * this and diffs the detail lines against it, and demo mode renders the same
 * screens from the same events. A demo built from a second fixture would be a
 * demo of something the tests never look at.
 *
 * The events are shaped by `sessionEventSchema` and parsed like any other —
 * they are data on the way in, not a shortcut past invariant 4.
 */
const SESSION = "b1c9f2e0-0000-7000-8000-abcdefabcdef";

const at = (
  seq: number,
): { seq: number; sessionId: string; createdAt: Date } => ({
  createdAt: new Date(1_770_000_000_000 + seq * 1000),
  seq,
  sessionId: SESSION,
});

export const RECORDED_LOG: readonly StoredEvent[] = [
  {
    ...at(1),
    event: {
      modelId: "gpt-5",
      role: "research",
      stageId: "corpus-select",
      tier: "balanced",
      type: "stage_start",
    },
  },
  {
    ...at(2),
    event: {
      line: "38 works found; choosing 12",
      stageId: "corpus-select",
      type: "stage_detail",
    },
  },
  {
    ...at(3),
    event: {
      line: "Ward No. 6 — the late style, and the one everyone reads",
      stageId: "corpus-select",
      type: "stage_detail",
    },
  },
  {
    ...at(4),
    event: { elapsedMs: 4200, stageId: "corpus-select", type: "stage_end" },
  },
  {
    ...at(5),
    event: { role: "fetch", stageId: "work-fetch", type: "stage_start" },
  },
  {
    ...at(6),
    event: {
      line: "Ward No. 6 — 24,118 words",
      stageId: "work-fetch",
      type: "stage_detail",
    },
  },
  {
    ...at(7),
    event: { elapsedMs: 31_500, stageId: "work-fetch", type: "stage_end" },
  },
  {
    ...at(8),
    event: { role: "measure", stageId: "prosody-compute", type: "stage_start" },
  },
  {
    ...at(9),
    event: {
      line: "12 works measured",
      stageId: "prosody-compute",
      type: "stage_detail",
    },
  },
  {
    ...at(10),
    event: { elapsedMs: 900, stageId: "prosody-compute", type: "stage_end" },
  },
];

export const RECORDED_SESSION_ID = SESSION;
