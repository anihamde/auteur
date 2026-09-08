import { WizardRail } from "@auteur/component-library/pipeline";
import {
  createThemeController,
  type ThemeMode,
  ThemeToggle,
} from "@auteur/component-library/theme";
import { COPY } from "@auteur/copy/index";
import type { Step } from "@auteur/core/session";
import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { AuthorScreen } from "../screens/author.tsx";
import { ClarifyScreen } from "../screens/clarify.tsx";
import { DraftScreen } from "../screens/draft.tsx";
import { IdeaScreen } from "../screens/idea.tsx";
import { ModelsOverlay } from "../screens/models.tsx";
import { OutlineScreen } from "../screens/outline.tsx";
import { ResearchScreen } from "../screens/research.tsx";
import { ResultScreen } from "../screens/result.tsx";
import {
  EMPTY,
  type SessionState,
  STEP_ORDER,
  stepIndex,
  type Transport,
} from "./session-state.ts";

/**
 * The shell: the rail, the main column, and the seven steps.
 *
 * One route and one component, because the wizard is one session: a router
 * would put the step in the URL and then have to keep it agreeing with
 * `session.step`, which the server owns. The rail reads from session state and
 * so does the screen, so they cannot disagree.
 */

const token = (name: string): string => `var(--${name})`;

/** Where a reload finds the session it was in the middle of. */
export const SESSION_KEY = "auteur.session";

export const readStoredSession = (): string | undefined => {
  try {
    return globalThis.localStorage.getItem(SESSION_KEY) ?? undefined;
  } catch {
    // Private browsing and blocked storage both throw. A session that cannot
    // be remembered is still usable; it just does not survive a reload.
    return undefined;
  }
};

export const storeSession = (id: string): void => {
  try {
    globalThis.localStorage.setItem(SESSION_KEY, id);
  } catch {
    // As above.
  }
};

export type AppProps = {
  readonly transport: Transport;
  /** Injected so a test can mount from a serialized session. */
  readonly initial?: SessionState;
  /** Overrides the id the session view carries. Tests only. */
  readonly sessionId?: string;
};

export const App = ({
  initial = EMPTY,
  sessionId: override,
  transport,
}: AppProps): ReactElement => {
  const [state, setState] = useState<SessionState>(initial);
  const [mode, setMode] = useState<ThemeMode>("auto");
  const [overlay, setOverlay] = useState(false);

  /**
   * The session this app is driving.
   *
   * **Derived from the view, not held beside it.** A separate piece of state
   * would be a second source for the same id, and the first thing it does is
   * disagree — which is what happened before this: nothing set it, so every
   * screen's actions returned early and the app looked alive and did nothing.
   */
  const sessionId = override ?? state.view?.session.id;

  useEffect(() => {
    const controller = createThemeController({
      root: document.documentElement,
    });
    setMode(controller.get());
    return controller.stop;
  }, []);

  // Resume the stored session on first mount. `GET /api/sessions/:id` carries
  // everything a reload needs (§7.1), so this is one request and not a
  // reconstruction.
  useEffect(() => {
    if (state.view !== undefined) return;
    const stored = readStoredSession();
    if (stored === undefined) return;
    void transport.client
      .call("session", { params: { id: stored } })
      .then((view) => {
        setState((previous) => ({ ...previous, view }));
      })
      .catch(() => undefined);
  }, [state.view, transport]);

  useEffect(() => {
    if (sessionId === undefined) return;
    storeSession(sessionId);
  }, [sessionId]);

  /**
   * The highest seq held, read by the stream effect without depending on it.
   *
   * A ref rather than a dependency: keying the effect on the event list would
   * close and reopen the stream on every delta, which is a reconnect per token.
   * Reading `state.events` inside an effect keyed only on the session would be
   * a stale closure — correct on the first open and wrong on every reopen.
   */
  const cursor = useRef(0);
  cursor.current = state.events.at(-1)?.seq ?? cursor.current;

  // One stream per session, resumed from the highest seq already held — so a
  // reload replays what it missed and nothing it already has.
  useEffect(() => {
    if (sessionId === undefined) return;
    const stream = transport.openStream(sessionId, cursor.current, (event) => {
      setState((previous) => ({
        ...previous,
        events: [...previous.events, event],
      }));
    });
    return () => {
      stream.close();
    };
  }, [sessionId, transport]);

  const step: Step = state.view?.session.step ?? "idea";
  const current = stepIndex(step);

  // The rail's notes come from session state in one place. A screen that wrote
  // its own note would be a second source for the same fact, and the two would
  // disagree after a reload.
  const steps = useMemo(
    () =>
      STEP_ORDER.map((id) => {
        const note = noteFor(id, state);
        return {
          id,
          label: COPY.shell.steps[id],
          ...(note !== undefined && { note }),
        };
      }),
    [state],
  );

  const go = async (to: Step): Promise<void> => {
    if (sessionId === undefined) return;
    await transport.client.call("patchSession", {
      body: { step: to },
      params: { id: sessionId },
    });
    const view = await transport.client.call("session", {
      params: { id: sessionId },
    });
    setState((previous) => ({ ...previous, view }));
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <WizardRail
        current={current}
        footer={<ThemeToggle mode={mode} onChange={setMode} size="sm" />}
        header={
          <div>
            <div
              style={{
                fontFamily: token("font-script"),
                fontSize: token("text-3xl"),
              }}
            >
              {COPY.shell.wordmark}
            </div>
            <div
              style={{
                color: token("text-muted"),
                fontSize: token("text-2xs"),
              }}
            >
              {COPY.shell.eyebrow}
            </div>
          </div>
        }
        onStep={(index) => {
          const target = STEP_ORDER[index];
          if (target !== undefined) void go(target);
        }}
        steps={steps}
      />
      <main
        style={{
          flex: "1",
          padding: token("gutter-screen"),
        }}
      >
        <Screen
          onOpenModels={() => {
            setOverlay(true);
          }}
          setState={setState}
          state={state}
          step={step}
          {...(sessionId === undefined ? {} : { sessionId })}
          transport={transport}
        />
      </main>
      {overlay ? (
        <ModelsOverlay
          onClose={() => {
            setOverlay(false);
          }}
          {...(sessionId === undefined ? {} : { sessionId })}
          transport={transport}
        />
      ) : undefined}
    </div>
  );
};

/**
 * The rail's right-aligned mono note for one step.
 *
 * Derived, never stored: a note that was written when a step completed is a
 * note that survives a change to the thing it described.
 */
export const noteFor = (
  step: Step,
  state: SessionState,
): string | undefined => {
  const view = state.view;
  if (view === undefined) return undefined;
  switch (step) {
    case "idea": {
      return view.session.lengthPreset;
    }
    case "author": {
      return view.session.authorId ?? undefined;
    }
    case "research": {
      return view.card === null
        ? undefined
        : `card@${view.card.version.toString()}`;
    }
    case "clarify": {
      return view.answers.length === 0
        ? undefined
        : `${view.answers.length.toString()} asked`;
    }
    case "outline": {
      return view.outline === null
        ? undefined
        : `${view.outline.beats.length.toString()} beats`;
    }
    case "draft": {
      return view.story === null
        ? undefined
        : `${view.story.wordCount.toLocaleString("en-US")} words`;
    }
    default: {
      return view.report === null ? undefined : "measured";
    }
  }
};

type ScreenProps = {
  readonly step: Step;
  readonly state: SessionState;
  readonly setState: (update: (previous: SessionState) => SessionState) => void;
  readonly transport: Transport;
  readonly sessionId?: string;
  readonly onOpenModels: () => void;
};

const Screen = (props: ScreenProps): ReactElement => {
  switch (props.step) {
    case "idea": {
      return <IdeaScreen {...props} />;
    }
    case "author": {
      return <AuthorScreen {...props} />;
    }
    case "research": {
      return <ResearchScreen {...props} />;
    }
    case "clarify": {
      return <ClarifyScreen {...props} />;
    }
    case "outline": {
      return <OutlineScreen {...props} />;
    }
    case "draft": {
      return <DraftScreen {...props} />;
    }
    default: {
      return <ResultScreen {...props} />;
    }
  }
};

export type { ScreenProps };
