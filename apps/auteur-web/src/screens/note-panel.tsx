import { Button } from "@auteur/component-library/core";
import { Textarea } from "@auteur/component-library/forms";
import { COPY } from "@auteur/copy/index";
import {
  NOTE_LONGEST,
  type RevisableStage,
  type RevisionNote,
} from "@auteur/core/session";
import { type ReactElement, useState } from "react";
import type { Transport } from "../shell/session-state.ts";

/**
 * Say what you want changed, and ask for it again.
 *
 * The same panel on the outline screen and the story screen, because it is the
 * same loop: read what was made, write a sentence about it, press the button,
 * read what was made. Two copies would be two places for "the notes are shown
 * oldest first" to stop being true.
 *
 * Filing a note and re-running are **one press**, deliberately — but two
 * requests, and in this order. `POST /notes` changes the note set, which
 * changes the stage's input key; `POST /advance` is what reads that and
 * enqueues what is now stale. Reversing them would advance against the note set
 * as it was and run nothing.
 */

export type NotePanelProps = {
  readonly stageId: RevisableStage;
  readonly sessionId?: string;
  readonly transport: Transport;
  readonly notes: readonly RevisionNote[];
  /** The step to advance to, which for a rewrite is the step you are on. */
  readonly step: "outline" | "story";
  readonly onDone: () => Promise<void>;
  readonly copy: {
    readonly hint: string;
    readonly placeholder: string;
    readonly notesLabel: string;
    readonly rewrite: string;
  };
};

export const NotePanel = ({
  copy,
  notes,
  onDone,
  sessionId,
  stageId,
  step,
  transport,
}: NotePanelProps): ReactElement => {
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);

  const mine = notes.filter((entry) => entry.stageId === stageId);

  const rewrite = async (): Promise<void> => {
    if (sessionId === undefined || note.trim() === "") return;
    setWorking(true);
    try {
      await transport.client.call("notes", {
        body: { note: note.trim(), stageId },
        params: { id: sessionId },
      });
      await transport.client.call("advance", {
        body: { to: step },
        params: { id: sessionId },
      });
      setNote("");
      await onDone();
    } finally {
      setWorking(false);
    }
  };

  return (
    <section>
      {mine.length === 0 ? undefined : (
        <>
          <h3>{copy.notesLabel}</h3>
          <ol>
            {mine.map((entry) => (
              <li key={entry.id}>{entry.note}</li>
            ))}
          </ol>
        </>
      )}
      <label htmlFor={`note-${stageId}`}>{copy.hint}</label>
      <Textarea
        id={`note-${stageId}`}
        maxLength={NOTE_LONGEST}
        onChange={(event) => {
          setNote(event.currentTarget.value);
        }}
        placeholder={copy.placeholder}
        value={note}
      />
      <Button
        disabled={working || note.trim() === ""}
        onClick={() => void rewrite()}
        variant="secondary"
      >
        {working ? COPY.shell.working : copy.rewrite}
      </Button>
    </section>
  );
};
