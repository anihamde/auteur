/* auteur theme resolver.
   Three modes: 'auto' (default), 'light', 'dark'. 'auto' resolves by local
   clock — light from 06:00 to 18:00, dark otherwise — and re-resolves each
   minute, so a session left open crosses over on its own.
   Sets data-theme (resolved: light|dark) and data-theme-mode (as chosen) on
   <html>, and fires 'auteurthemechange' on <html>.
   Load this in <head>, before first paint, to avoid a flash. */
(function () {
  var KEY = 'auteur.theme';
  var root = document.documentElement;
  function byTime(d) { var h = (d || new Date()).getHours(); return h >= 6 && h < 18 ? 'light' : 'dark'; }
  function get() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function resolve(mode) { return (mode || get()) === 'auto' ? byTime() : (mode || get()); }
  function apply(mode) {
    var theme = resolve(mode);
    if (root.dataset.theme === theme && root.dataset.themeMode === mode) return;
    root.dataset.theme = theme;
    root.dataset.themeMode = mode;
    root.dispatchEvent(new CustomEvent('auteurthemechange', { detail: { mode: mode, theme: theme } }));
  }
  function set(mode) { try { localStorage.setItem(KEY, mode); } catch (e) {} apply(mode); }
  apply(get());
  setInterval(function () { if (get() === 'auto') apply('auto'); }, 60000);
  window.AuteurTheme = { KEY: KEY, modes: ['auto', 'light', 'dark'], get: get, set: set, resolve: resolve, byTime: byTime,
    cycle: function () { var o = this.modes, n = o[(o.indexOf(get()) + 1) % o.length]; set(n); return n; } };
})();
