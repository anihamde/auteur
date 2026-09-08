import { GlobalRegistrator } from "@happy-dom/global-registrator";

/**
 * The DOM, registered once per test process.
 *
 * Loaded through `bunfig.toml`'s `preload` rather than imported by each suite,
 * because registration is a global side effect and a suite that forgot it would
 * fail with `document is not defined` from whichever line happened to touch the
 * DOM first — a confusing distance from the cause.
 *
 * happy-dom rather than jsdom: `ARCHITECTURE.md` §11 chose it for start-up
 * time, and start-up time is paid once per test file.
 */
if (typeof globalThis.document === "undefined") {
  GlobalRegistrator.register({ url: "https://auteur.test/" });
}

/**
 * `matchMedia`, which happy-dom implements and jsdom does not.
 *
 * Asserted rather than polyfilled: the theme resolver and the reduced-motion
 * condition both read it, and a stub that always answered `false` would make
 * every reduced-motion test pass while proving nothing.
 */
export const hasMatchMedia = (): boolean =>
  typeof globalThis.matchMedia === "function";
