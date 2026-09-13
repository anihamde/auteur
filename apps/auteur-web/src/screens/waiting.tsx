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
      <p>
        {state === "failed"
          ? COPY.shell.stageFailed
          : state === "running"
            ? COPY.shell.stageRunning
            : COPY.shell.stageQueued}
      </p>
    </div>
  );
};
