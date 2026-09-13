import { Thinking } from "@auteur/component-library/pipeline";
import { COPY } from "@auteur/copy/index";
import type { StoredEvent } from "@auteur/core/events";
import type { ReactElement } from "react";
import { detailFor, stateFor } from "../shell/session-state.ts";

/**
 * What this screen is waiting for, while it waits.
 *
 * Every screen after `research` rendered its artifact or an empty element — an
 * empty paper card where the beat sheet goes, an empty prose card where the
 * story goes, a questions screen with no questions. The three look identical
 * to a screen whose stage failed, and identical to a screen whose stream has
 * stopped delivering, so the only way to tell was to reload. That is what the
 * reader did, every time.
 *
 * The same `Thinking` row the research screen already uses, with the same
 * detail lines, read from the same events. A second way of saying "running"
 * would be a second thing to keep true.
 */
/**
 * One sentence per state, and `done` is the one that is easy to forget.
 *
 * A stage can finish and produce nothing: `clarify` is asked to judge whether
 * the idea leaves anything open, and "no" is a legitimate answer — it writes no
 * questions, emits `stage_end`, and nothing else ever runs on that step. With
 * `done` falling through to the queued sentence, the screen told the reader the
 * step had not started, under a row whose dot was already green, on a session
 * that was ready to move on.
 */
const SENTENCE: Readonly<Record<ReturnType<typeof stateFor>, string>> = {
  done: COPY.shell.stageEmpty,
  failed: COPY.shell.stageFailed,
  pending: COPY.shell.stageQueued,
  running: COPY.shell.stageRunning,
};

export type WaitingProps = {
  readonly events: readonly StoredEvent[];
  readonly stageId: string;
};

export const Waiting = ({ events, stageId }: WaitingProps): ReactElement => {
  const state = stateFor(events, stageId);
  return (
    <div data-waiting={stageId}>
      <Thinking
        detail={detailFor(events, stageId)}
        stage={stageId}
        state={state}
      />
      <p>{SENTENCE[state]}</p>
    </div>
  );
};
