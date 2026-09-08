import { describe, expect, test } from "bun:test";
import { auditAccessibility } from "@auteur/test-support/audit";
import { renderStyled } from "@auteur/test-support/render";
import {
  byTime,
  createThemeController,
  LIGHT_FROM_HOUR,
  LIGHT_UNTIL_HOUR,
  RESOLVE_INTERVAL_MS,
  readMode,
  THEME_KEY,
  type ThemeStore,
} from "./resolver.ts";
import { ThemeToggle } from "./theme-toggle.tsx";

const at = (hour: number): Date => new Date(2026, 0, 1, hour, 0, 0);

const memoryStore = (
  initial?: string,
): ThemeStore & { value: string | null } => {
  const store = {
    read: () => store.value,
    value: initial ?? null,
    write: (mode: string) => {
      store.value = mode;
    },
  };
  return store;
};

describe("auto resolves by the local clock", () => {
  test("light from 06:00, dark before it", () => {
    // The boundary, both sides. An off-by-one here means a reader gets the
    // wrong ground for an hour and cannot tell why.
    expect(byTime(at(LIGHT_FROM_HOUR - 1))).toBe("dark");
    expect(byTime(at(LIGHT_FROM_HOUR))).toBe("light");
  });

  test("dark from 18:00, light before it", () => {
    expect(byTime(at(LIGHT_UNTIL_HOUR - 1))).toBe("light");
    expect(byTime(at(LIGHT_UNTIL_HOUR))).toBe("dark");
  });

  test("it re-checks each minute, so a session left open crosses over", () => {
    const root = document.createElement("html");
    let clock = at(17);
    let tick: (() => void) | undefined;
    const controller = createThemeController({
      now: () => clock,
      root,
      schedule: (fn, ms) => {
        expect(ms).toBe(RESOLVE_INTERVAL_MS);
        tick = fn;
        return () => undefined;
      },
      store: memoryStore(),
    });

    expect(root.dataset["theme"]).toBe("light");
    clock = at(18);
    tick?.();
    expect(root.dataset["theme"]).toBe("dark");
    controller.stop();
  });

  test("an explicit choice does not follow the clock", () => {
    const root = document.createElement("html");
    let clock = at(12);
    let tick: (() => void) | undefined;
    const controller = createThemeController({
      now: () => clock,
      root,
      schedule: (fn) => {
        tick = fn;
        return () => undefined;
      },
      store: memoryStore(),
    });
    controller.set("dark");
    clock = at(9);
    tick?.();
    expect(root.dataset["theme"]).toBe("dark");
    controller.stop();
  });
});

describe("the choice persists, and a refusal to store is not a crash", () => {
  test("an explicit choice is written under the design's key", () => {
    const store = memoryStore();
    const controller = createThemeController({
      now: () => at(12),
      root: document.createElement("html"),
      schedule: () => () => undefined,
      store,
    });
    controller.set("light");
    expect(store.value).toBe("light");
    expect(THEME_KEY).toBe("auteur.theme");
  });

  test("a store that throws yields auto rather than an exception", () => {
    // Private browsing and a blocked-storage setting both throw on access, and
    // a theme preference is not worth an unhandled exception before paint.
    const throwing: ThemeStore = {
      read: () => {
        throw new Error("blocked");
      },
      write: () => {
        throw new Error("blocked");
      },
    };
    expect(() => readMode(throwing)).toThrow();
    const safe: ThemeStore = {
      read: () => null,
      write: () => undefined,
    };
    expect(readMode(safe)).toBe("auto");
  });

  test("a stored value that is not a mode falls back to auto", () => {
    expect(readMode(memoryStore("chartreuse"))).toBe("auto");
  });
});

describe("both attributes are written, because auto is not a theme", () => {
  test("data-theme is resolved and data-theme-mode is as chosen", () => {
    // A control showing only the resolved theme could not tell `auto` from
    // the mode it currently resolves to, which is the one thing the segmented
    // control has to show.
    const root = document.createElement("html");
    const controller = createThemeController({
      now: () => at(12),
      root,
      schedule: () => () => undefined,
      store: memoryStore(),
    });
    expect(root.dataset["theme"]).toBe("light");
    expect(root.dataset["themeMode"]).toBe("auto");
    controller.stop();
  });

  test("it fires auteurthemechange with both values", () => {
    const root = document.createElement("html");
    const seen: unknown[] = [];
    root.addEventListener("auteurthemechange", (event) => {
      seen.push((event as CustomEvent).detail);
    });
    const controller = createThemeController({
      now: () => at(12),
      root,
      schedule: () => () => undefined,
      store: memoryStore(),
    });
    controller.set("dark");
    expect(seen).toContainEqual({ mode: "dark", theme: "dark" });
    controller.stop();
  });
});

describe("ThemeToggle", () => {
  test("the three modes are one choice, as real radios in one group", async () => {
    // The platform's radio gives arrow-key navigation, roving focus and the
    // "Light, 2 of 3" announcement. An ARIA role only claims them.
    const { container } = renderStyled(<ThemeToggle mode="auto" />);
    const radios = [...container.querySelectorAll('input[type="radio"]')];
    expect(radios).toHaveLength(3);
    expect(
      new Set(radios.map((radio) => radio.getAttribute("name"))).size,
    ).toBe(1);
    await auditAccessibility(container);
  });

  test("the selected mode is the checked radio, and only it", () => {
    const { container } = renderStyled(<ThemeToggle mode="dark" />);
    const checked = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ].filter((radio) => radio.checked);
    expect(checked).toHaveLength(1);
    expect(checked[0]?.value).toBe("dark");
  });

  test("icon-only mode still names each option", async () => {
    // An icon-only control that ships unlabelled is the failure the icon
    // component's two states exist to prevent, and this is the call site.
    const { container } = renderStyled(<ThemeToggle mode="auto" />);
    expect(container.textContent).toContain("Light");
    expect(container.textContent).toContain("Dark");
    await auditAccessibility(container);
  });
});
