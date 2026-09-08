/**
 * The theme resolver, ported from `docs/design/wizard-handoff/theme.js`.
 *
 * Three modes. `auto` resolves by the local clock — light from 06:00 to 18:00,
 * dark otherwise — and re-resolves each minute, so a session left open crosses
 * over on its own.
 *
 * The clock and the storage are **injected**, which the handoff's script cannot
 * do because it runs before any module system exists. That is the only change:
 * a test can then assert 05:59 and 06:00 rather than waiting for morning.
 */

export const THEME_KEY = "auteur.theme";
export const THEME_MODES = ["auto", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export type ResolvedTheme = "light" | "dark";

/** How often `auto` re-checks the clock. */
export const RESOLVE_INTERVAL_MS = 60_000;

export const LIGHT_FROM_HOUR = 6;
export const LIGHT_UNTIL_HOUR = 18;

export const isThemeMode = (value: unknown): value is ThemeMode =>
  typeof value === "string" &&
  (THEME_MODES as readonly string[]).includes(value);

/** Light between 06:00 and 18:00 local, dark otherwise. */
export const byTime = (at: Date): ResolvedTheme =>
  at.getHours() >= LIGHT_FROM_HOUR && at.getHours() < LIGHT_UNTIL_HOUR
    ? "light"
    : "dark";

export const resolveTheme = (mode: ThemeMode, at: Date): ResolvedTheme =>
  mode === "auto" ? byTime(at) : mode;

export type ThemeStore = {
  readonly read: () => string | null;
  readonly write: (mode: string) => void;
};

/**
 * `localStorage`, wrapped so a refusal is a default rather than a crash.
 *
 * Private browsing and a blocked-storage setting both throw on access, and a
 * theme preference is not worth an unhandled exception before first paint.
 */
export const browserStore = (): ThemeStore => ({
  read: () => {
    try {
      return globalThis.localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  },
  write: (mode) => {
    try {
      globalThis.localStorage.setItem(THEME_KEY, mode);
    } catch {
      // A preference that cannot be stored is still applied for this session.
    }
  },
});

export const readMode = (store: ThemeStore): ThemeMode => {
  const stored = store.read();
  return isThemeMode(stored) ? stored : "auto";
};

export type ThemeController = {
  readonly get: () => ThemeMode;
  readonly set: (mode: ThemeMode) => void;
  readonly resolved: () => ResolvedTheme;
  readonly stop: () => void;
};

/**
 * Apply the theme to a root element and keep `auto` current.
 *
 * Writes `data-theme` (resolved) and `data-theme-mode` (as chosen), and fires
 * `auteurthemechange`. Two attributes rather than one, because a control that
 * showed the resolved theme could not tell `auto` from the mode it currently
 * resolves to — which is the one thing the segmented control has to show.
 */
export const createThemeController = (options: {
  readonly root: HTMLElement;
  readonly store?: ThemeStore;
  readonly now?: () => Date;
  readonly schedule?: (fn: () => void, ms: number) => () => void;
}): ThemeController => {
  const store = options.store ?? browserStore();
  const now = options.now ?? (() => new Date());

  let mode = readMode(store);
  let resolved: ResolvedTheme = resolveTheme(mode, now());

  const apply = (next: ThemeMode): void => {
    const theme = resolveTheme(next, now());
    if (
      options.root.dataset["theme"] === theme &&
      options.root.dataset["themeMode"] === next
    ) {
      return;
    }
    mode = next;
    resolved = theme;
    options.root.dataset["theme"] = theme;
    options.root.dataset["themeMode"] = next;
    options.root.dispatchEvent(
      new CustomEvent("auteurthemechange", { detail: { mode: next, theme } }),
    );
  };

  apply(mode);

  const cancel =
    options.schedule?.(() => {
      if (mode === "auto") apply("auto");
    }, RESOLVE_INTERVAL_MS) ??
    (() => {
      const handle = setInterval(() => {
        if (mode === "auto") apply("auto");
      }, RESOLVE_INTERVAL_MS);
      return () => {
        clearInterval(handle);
      };
    })();

  return {
    get: () => mode,
    resolved: () => resolved,
    set: (next) => {
      store.write(next);
      apply(next);
    },
    stop: cancel,
  };
};
