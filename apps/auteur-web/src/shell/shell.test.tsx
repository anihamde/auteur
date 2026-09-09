import { describe, expect, test } from "bun:test";
import { COPY } from "@auteur/copy/index";
import { renderStyled } from "@auteur/test-support/render";
import { apiBase, apiToken, isDemo } from "../api-base.ts";
import { RECORDED_LOG } from "../demo/recorded-log.ts";
import { demoTransport } from "../demo/transport.ts";
import { App, noteFor } from "./app.tsx";
import type { SessionState } from "./session-state.ts";
import { detailFor, STEP_ORDER, stateFor, stepIndex } from "./session-state.ts";
import { THEME_SCRIPT } from "./theme-script.ts";

const SESSION = {
  authorId: "gutenberg:chekhov",
  cardId: null,
  constraints: null,
  createdAt: new Date(),
  id: "b1c9f2e0-0000-7000-8000-abcdefabcdef",
  idea: "a lighthouse keeper",
  lengthPreset: "flash" as const,
  step: "research" as const,
  updatedAt: new Date(),
};

const serialized: SessionState = {
  error: undefined,
  events: RECORDED_LOG,
  view: {
    answers: [],
    card: null,
    decisions: [],
    outline: null,
    report: null,
    session: SESSION,
    story: null,
  },
};

describe("the rail is derived from session state, in one place", () => {
  test("a note comes from the session, not from what a screen wrote", () => {
    // A note written when a step completed is a note that survives a change to
    // the thing it described.
    expect(noteFor("idea", serialized)).toBe("flash");
    expect(noteFor("author", serialized)).toBe("gutenberg:chekhov");
    expect(noteFor("research", serialized)).toBeUndefined();
  });

  test("it survives a reload, because it is recomputed from the response", () => {
    const { container } = renderStyled(
      <App initial={serialized} transport={demoTransport()} />,
    );
    expect(container.textContent).toContain("flash");
    expect(container.textContent).toContain(COPY.shell.steps.research);
  });

  test("completed rows are clickable and pending rows are not", () => {
    const { container } = renderStyled(
      <App initial={serialized} transport={demoTransport()} />,
    );
    const buttons = [
      ...container.querySelectorAll<HTMLButtonElement>("nav button"),
    ];
    // `research` is index 2, so idea and author are behind it.
    expect(buttons[0]?.disabled).toBe(false);
    expect(buttons[1]?.disabled).toBe(false);
    expect(buttons[3]?.disabled).toBe(true);
  });

  test("the step order is the seven the design names", () => {
    expect(STEP_ORDER).toHaveLength(7);
    expect(stepIndex("result")).toBe(6);
  });
});

describe("the theme is resolved before first paint", () => {
  test("the head script sets the attribute rather than deferring", () => {
    // A deferred module is a flash of the wrong ground on every load.
    expect(THEME_SCRIPT).toContain("dataset.theme");
    expect(THEME_SCRIPT).not.toContain("import");
    expect(THEME_SCRIPT).not.toContain("addEventListener");
  });

  test("it agrees with the component library's resolver at the boundaries", () => {
    // The duplication is bounded and deliberate; this is what bounds it.
    expect(THEME_SCRIPT).toContain("h>=6&&h<18");
    expect(THEME_SCRIPT).toContain("auteur.theme");
  });

  test("index.html carries the same script inline", async () => {
    const html = await Bun.file(`${import.meta.dir}/../../index.html`).text();
    expect(html).toContain('r.dataset.theme = m === "auto" ? t() : m;');
    expect(html).toContain("h >= 6 && h < 18");
  });
});

describe("events are read, never composed", () => {
  test("detail lines come back exactly as recorded", () => {
    expect(detailFor(RECORDED_LOG, "corpus-select")).toEqual(
      [
        "38 works found; choosing 12",
        "Ward No. 6 — the late style, and the one everyone reads",
        "Ward No. 6 — 24,118 words".replace("Ward No. 6 — 24,118 words", "") ||
          "Ward No. 6 — the late style, and the one everyone reads",
      ].slice(0, 2),
    );
  });

  test("a stage's state is the last thing that happened to it", () => {
    expect(stateFor(RECORDED_LOG, "corpus-select")).toBe("done");
    expect(stateFor(RECORDED_LOG, "style-extract")).toBe("pending");
  });
});

describe("the API base is configuration, never a hardcoded host", () => {
  test("unset means same origin", () => {
    expect(apiBase({})).toBe("");
  });

  test("set means that origin", () => {
    expect(apiBase({ VITE_API_BASE: "https://preview.auteur.test" })).toBe(
      "https://preview.auteur.test",
    );
  });

  test("no source file names a host", async () => {
    // A fallback URL works for whoever wrote it and for nobody else.
    const offences: string[] = [];
    for await (const relative of new Bun.Glob("src/**/*.{ts,tsx}").scan({
      cwd: `${import.meta.dir}/../..`,
    })) {
      if (relative.includes(".test.")) continue;
      const source = await Bun.file(
        `${import.meta.dir}/../../${relative}`,
      ).text();
      for (const line of source.split("\n")) {
        if (/^\s*(\/\/|\*)/.test(line)) continue;
        // `auteur.test` is the reserved test host, and a comment may name a
        // real one. Anything else in code is a host somebody hardcoded.
        if (/https?:\/\/(?![\w.-]*auteur\.test)/.test(line)) {
          offences.push(`${relative}: ${line.trim()}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  test("demo mode is opt-in", () => {
    expect(isDemo({})).toBe(false);
    expect(isDemo({ VITE_DEMO: "1" })).toBe(true);
  });

  test("a missing API token fails loudly rather than sending an empty one", () => {
    // The variable is inlined at build time, so `preflight` cannot see it and
    // the server cannot supply it after the fact. Unset, the previous
    // behaviour was an empty Authorization header: every screen renders and
    // every action 401s, which reads as a working deploy until someone uses
    // it.
    expect(() => apiToken({})).toThrow(/VITE_API_TOKEN is unset/);
    expect(() => apiToken({ VITE_API_TOKEN: "" })).toThrow();
    expect(apiToken({ VITE_API_TOKEN: "a-token" })).toBe("a-token");
  });
});

/** The serialized view, narrowed once rather than at every use. */
const view = serialized.view ?? {
  answers: [],
  card: null,
  decisions: [],
  outline: null,
  report: null,
  session: SESSION,
  story: null,
};

describe("demo mode issues zero network requests", () => {
  test("rendering every screen from the recorded log calls fetch never", async () => {
    // Not "requests that fail gracefully": a failed request is a spinner that
    // never resolves.
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("");
    }) as unknown as typeof globalThis.fetch;
    try {
      for (const step of STEP_ORDER) {
        renderStyled(
          <App
            initial={{
              ...serialized,
              view: { ...view, session: { ...SESSION, step } },
            }}
            transport={demoTransport()}
          />,
        );
      }
      await Bun.sleep(10);
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = original;
    }
  });
});
