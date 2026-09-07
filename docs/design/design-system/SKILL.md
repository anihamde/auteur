---
name: auteur-design
description: Use this skill to generate well-branded interfaces and assets for auteur, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for protoyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Orientation

- `readme.md` is the design guide: sources, content fundamentals, visual foundations, iconography, and an index of everything else. Read it first.
- `styles.css` is the only file a consumer links. It is `@import` lines only, reaching `tokens/fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `base.css`, `theme-light.css`.
- Style through the semantic aliases (`--surface-card`, `--text-muted`, `--accent`), not the ramps (`--ink-850`, `--prussian-500`). Anything that reaches past an alias to a ramp value will not theme.
- Two themes. Dark is the default; `data-theme="light"` re-points the aliases onto the paper ramp. `assets/theme.js` resolves the choice (auto by local clock, or a stored preference) and must load in `<head>` before first paint; `ThemeToggle` is the only control.
- `components/` holds 16 React primitives in 5 groups, each with a `.d.ts` props contract and a `.prompt.md` describing what it is and when to use it. Read the `.prompt.md` files before composing screens.
- `ui_kits/auteur-web/` is a click-through recreation of the whole seven-step wizard — the reference for how the primitives compose into real screens.
- `guidelines/*.html` are specimen cards, each openable in a browser. `brand-mark-options.html` and `type-options.html` record the alternatives that were considered and rejected.
- Icons are Lucide, loaded per-icon from the `lucide-static` CDN as a CSS mask via the `Icon` component. No emoji, no unicode glyphs as icons.

## Two things are unfinished

1. **No font binaries were supplied.** `tokens/fonts.css` loads EB Garamond, Archivo, IBM Plex Mono and Great Vibes from the Google Fonts CDN. All but Archivo are OFL. If real licensed faces exist, replacing them is a one-file change.
2. **`assets/logo.svg` is live `<text>`, not an outlined path.** It renders correctly only when inlined in a page that has the webfont loaded; as an `<img>` or CSS mask it falls back to generic cursive. The file's own comment carries the four steps to outline it. Do not attempt to redraw the mark by hand — it is a Great Vibes capital A, and hand-authored beziers will not reproduce its stroke contrast.
