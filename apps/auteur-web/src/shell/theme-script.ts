/**
 * The theme, resolved before first paint.
 *
 * This runs as an inline `<script>` in `<head>`, which is why it is a string
 * rather than a module: a module is deferred, and a deferred theme is a flash
 * of the wrong ground on every load. `ARCHITECTURE.md` §8 calls that out as the
 * one thing the theme must not do.
 *
 * It is the same resolution `@auteur/component-library/theme` implements, and
 * that duplication is deliberate and bounded: this copy sets the attribute and
 * nothing else, and the controller takes over the moment React mounts. A test
 * asserts the two agree at the boundaries.
 */
export const THEME_SCRIPT = `(function(){
var k="auteur.theme",r=document.documentElement;
function t(){var h=new Date().getHours();return h>=6&&h<18?"light":"dark"}
var m="auto";try{m=localStorage.getItem(k)||"auto"}catch(e){}
r.dataset.theme=m==="auto"?t():m;r.dataset.themeMode=m;
})();`;
