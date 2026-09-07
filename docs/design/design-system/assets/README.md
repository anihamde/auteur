Contents:

| File | Use |
|---|---|
| `logo.svg` | The mark as live type (`<text>`, `fill="currentColor"`) — correct only when inlined in a page that has the webfont. **Awaiting a one-time outline export**; the file's own comment carries the steps. |
| `theme.js` | Theme resolver. Load in `<head>` before first paint; sets `data-theme` on `<html>` and exposes `window.AuteurTheme`. Pairs with `ThemeToggle`. |

The mark is a capital A set in **Great Vibes** (Google Fonts, OFL), exposed as
`--font-script`. It is a glyph, not a drawing: it carries its own thick/thin
contrast, so it is never stroked, outlined, bolded or boxed, and never placed on
a coloured tile. `--font-script` is for this one glyph — never set copy in it.

**It may stand alone** where the lockup will not fit: favicon, app icon, loading
state, avatar. Nowhere else. Below 30px the flourishes fill in — set the name in
roman throughout instead.

**Lockup: the mark IS the word's A.** Script capital, then `uteur` in EB
Garamond regular — never a script A beside a roman one. Baselines align, the A
sets at 1.8&times; the roman size, and the pair is kerned tight (about -1px,
optically, not by rule). Everything after the A stays lowercase. See
`guidelines/brand-wordmark.card.html`.

No icon set, illustration or photography was supplied. Icons come from Lucide
via CDN (`lucide-static`), applied as a CSS mask — see readme.md &rarr;
Iconography. Drop real brand material into this folder when it exists.
