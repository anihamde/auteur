One control for the whole theme system — put it in persistent chrome (the wizard rail footer), never on a screen body.

```jsx
<ThemeToggle size="sm" />
```

Uncontrolled by default: it reads and writes `window.AuteurTheme` from `assets/theme.js`, which must be loaded in `<head>` before first paint. With no resolver present it still works, setting `data-theme` on `<html>` directly, but the choice is not persisted.

- `mode` makes it controlled — use only in specimens and screenshots.
- `showLabels` adds Auto / Light / Dark beside the glyphs; icon-only is the default and the one used in the product.
- Default mode is `auto`: light 06:00–18:00 local, dark otherwise, re-resolved every minute.
