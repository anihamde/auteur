/* @ds-bundle: {"format":4,"namespace":"AuteurDesignSystem_11e1bd","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"CardHeader","sourcePath":"components/core/Card.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"ProsodyStat","sourcePath":"components/pipeline/ProsodyStat.jsx"},{"name":"ProvenanceMark","sourcePath":"components/pipeline/ProvenanceMark.jsx"},{"name":"Thinking","sourcePath":"components/pipeline/Thinking.jsx"},{"name":"WizardRail","sourcePath":"components/pipeline/WizardRail.jsx"},{"name":"Exemplar","sourcePath":"components/prose/Exemplar.jsx"},{"name":"Markdown","sourcePath":"components/prose/Markdown.jsx"},{"name":"ThemeToggle","sourcePath":"components/theme/ThemeToggle.jsx"}],"sourceHashes":{"assets/theme.js":"230c3053feba","components/core/Badge.jsx":"3f3fb6adb110","components/core/Button.jsx":"586b7b7e0d64","components/core/Card.jsx":"c4571a55b5cc","components/core/Icon.jsx":"dedd351d742f","components/forms/Field.jsx":"3f25be4605d9","components/forms/Input.jsx":"8d20e7b78282","components/forms/Select.jsx":"dc703d4db54e","components/forms/Textarea.jsx":"7ae227853561","components/pipeline/ProsodyStat.jsx":"33a5e812b47e","components/pipeline/ProvenanceMark.jsx":"a4b274ed6b47","components/pipeline/Thinking.jsx":"7624bcde92f7","components/pipeline/WizardRail.jsx":"9f7875585d4a","components/prose/Exemplar.jsx":"aaba1dfc80db","components/prose/Markdown.jsx":"9b48a9ec41ac","components/theme/ThemeToggle.jsx":"3e3af58ee7a1","ui_kits/auteur-web/App.jsx":"84d9bf0bc0b6","ui_kits/auteur-web/AuthorStep.jsx":"b1836a667166","ui_kits/auteur-web/ClarifyStep.jsx":"f582c690ebb8","ui_kits/auteur-web/DraftStep.jsx":"66ded48a188c","ui_kits/auteur-web/IdeaStep.jsx":"b6393200944a","ui_kits/auteur-web/OutlineStep.jsx":"e7ddfff39895","ui_kits/auteur-web/ResearchStep.jsx":"9df2c600158e","ui_kits/auteur-web/ResultStep.jsx":"ce0b0ab24284","ui_kits/auteur-web/Shell.jsx":"ed4d8c8735f3","ui_kits/auteur-web/data.js":"a74730323eb7"},"inlinedExternals":[],"unexposedExports":[{"name":"controlSurface","sourcePath":"components/forms/Input.jsx"}]} */

(() => {

const __ds_ns = (window.AuteurDesignSystem_11e1bd = window.AuteurDesignSystem_11e1bd || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// assets/theme.js
try { (() => {
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
  function byTime(d) {
    var h = (d || new Date()).getHours();
    return h >= 6 && h < 18 ? 'light' : 'dark';
  }
  function get() {
    try {
      return localStorage.getItem(KEY) || 'auto';
    } catch (e) {
      return 'auto';
    }
  }
  function resolve(mode) {
    return (mode || get()) === 'auto' ? byTime() : mode || get();
  }
  function apply(mode) {
    var theme = resolve(mode);
    if (root.dataset.theme === theme && root.dataset.themeMode === mode) return;
    root.dataset.theme = theme;
    root.dataset.themeMode = mode;
    root.dispatchEvent(new CustomEvent('auteurthemechange', {
      detail: {
        mode: mode,
        theme: theme
      }
    }));
  }
  function set(mode) {
    try {
      localStorage.setItem(KEY, mode);
    } catch (e) {}
    apply(mode);
  }
  apply(get());
  setInterval(function () {
    if (get() === 'auto') apply('auto');
  }, 60000);
  window.AuteurTheme = {
    KEY: KEY,
    modes: ['auto', 'light', 'dark'],
    get: get,
    set: set,
    resolve: resolve,
    byTime: byTime,
    cycle: function () {
      var o = this.modes,
        n = o[(o.indexOf(get()) + 1) % o.length];
      set(n);
      return n;
    }
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "assets/theme.js", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const badgeTones = {
  neutral: {
    color: 'var(--text-muted)',
    background: 'var(--surface-raised)',
    border: '1px solid var(--border-hairline)'
  },
  accent: {
    color: 'var(--text-accent)',
    background: 'var(--derived-tint)',
    border: '1px solid transparent'
  },
  measured: {
    color: 'var(--measured)',
    background: 'var(--measured-tint)',
    border: '1px solid transparent'
  },
  edited: {
    color: 'var(--edited)',
    background: 'var(--edited-tint)',
    border: '1px solid transparent'
  },
  fail: {
    color: 'var(--status-fail)',
    background: 'var(--danger-quiet)',
    border: '1px solid transparent'
  },
  cheap: {
    color: 'var(--tier-cheap)',
    background: 'var(--surface-raised)',
    border: '1px solid var(--border-hairline)'
  },
  balanced: {
    color: 'var(--tier-balanced)',
    background: 'var(--derived-tint)',
    border: '1px solid transparent'
  },
  strong: {
    color: 'var(--tier-strong)',
    background: 'var(--edited-tint)',
    border: '1px solid transparent'
  }
};
function Badge({
  tone = 'neutral',
  mono = false,
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-1)',
      height: 18,
      padding: '0 var(--space-1-5)',
      borderRadius: 'var(--radius-xs)',
      whiteSpace: 'nowrap',
      flex: '0 0 auto',
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
      fontSize: 'var(--text-2xs)',
      fontWeight: mono ? 400 : 600,
      letterSpacing: mono ? 'var(--tracking-normal)' : 'var(--tracking-caps)',
      textTransform: mono ? 'none' : 'uppercase',
      ...(badgeTones[tone] || badgeTones.neutral),
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const btnBase = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-2)',
  font: 'var(--type-label)',
  letterSpacing: 'var(--tracking-snug)',
  whiteSpace: 'nowrap',
  borderRadius: 'var(--radius-control)',
  border: '1px solid transparent',
  cursor: 'pointer',
  transition: 'var(--transition-control)',
  textDecoration: 'none',
  fontFamily: 'var(--font-sans)',
  appearance: 'none'
};
const btnSizes = {
  sm: {
    height: 'var(--control-height-sm)',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-xs)'
  },
  md: {
    height: 'var(--control-height)',
    padding: '0 var(--space-4)',
    fontSize: 'var(--text-sm)'
  },
  lg: {
    height: 'var(--control-height-lg)',
    padding: '0 var(--space-6)',
    fontSize: 'var(--text-base)'
  }
};
const btnVariants = {
  primary: {
    background: 'var(--accent)',
    color: 'var(--text-on-accent)',
    borderColor: 'var(--accent)'
  },
  secondary: {
    background: 'var(--surface-raised)',
    color: 'var(--text-body)',
    borderColor: 'var(--border-subtle)'
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-muted)',
    borderColor: 'transparent'
  },
  quiet: {
    background: 'var(--accent-quiet)',
    color: 'var(--text-accent)',
    borderColor: 'transparent'
  },
  danger: {
    background: 'transparent',
    color: 'var(--status-fail)',
    borderColor: 'var(--oxblood-600)'
  }
};
const btnHover = {
  primary: {
    background: 'var(--accent-hover)',
    borderColor: 'var(--accent-hover)'
  },
  secondary: {
    background: 'var(--surface-active)',
    borderColor: 'var(--border-strong)'
  },
  ghost: {
    background: 'var(--surface-hover)',
    color: 'var(--text-body)'
  },
  quiet: {
    background: 'var(--accent-quiet-hover)',
    color: 'var(--text-on-accent)'
  },
  danger: {
    background: 'var(--danger-quiet)',
    color: 'var(--status-fail)'
  }
};
function Button({
  variant = 'secondary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  href,
  type = 'button',
  children,
  style,
  onClick,
  ...rest
}) {
  const [hot, setHot] = React.useState(false);
  const [down, setDown] = React.useState(false);
  const off = disabled || loading;
  const css = {
    ...btnBase,
    ...(btnSizes[size] || btnSizes.md),
    ...(btnVariants[variant] || btnVariants.secondary),
    ...(hot && !off ? btnHover[variant] || btnHover.secondary : null),
    ...(down && !off ? {
      transform: 'translateY(1px)'
    } : null),
    ...(off ? {
      opacity: 0.42,
      cursor: 'not-allowed'
    } : null),
    ...(fullWidth ? {
      width: '100%'
    } : null),
    ...style
  };
  const handlers = {
    onMouseEnter: () => setHot(true),
    onMouseLeave: () => {
      setHot(false);
      setDown(false);
    },
    onMouseDown: () => setDown(true),
    onMouseUp: () => setDown(false)
  };
  const body = /*#__PURE__*/React.createElement(React.Fragment, null, loading ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 11,
      height: 11,
      borderRadius: 'var(--radius-round)',
      border: '1.5px solid currentColor',
      borderTopColor: 'transparent',
      animation: 'auteur-spin 620ms linear infinite',
      opacity: 0.9
    }
  }) : null, children);
  if (href && !off) return /*#__PURE__*/React.createElement("a", _extends({
    href: href,
    style: css
  }, handlers, rest), body);
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: off,
    onClick: onClick,
    style: css
  }, handlers, rest), body);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const cardGrounds = {
  ink: {
    background: 'var(--surface-card)',
    color: 'var(--text-body)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-card)'
  },
  panel: {
    background: 'var(--surface-panel)',
    color: 'var(--text-body)',
    border: '1px solid var(--border-hairline)',
    borderRadius: 'var(--radius-panel)',
    boxShadow: 'none'
  },
  paper: {
    background: 'var(--surface-paper)',
    color: 'var(--text-paper)',
    border: 'none',
    borderRadius: 'var(--radius-paper)',
    boxShadow: 'var(--shadow-paper)'
  },
  outline: {
    background: 'transparent',
    color: 'var(--text-body)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'none'
  }
};
const cardPads = {
  none: 0,
  sm: 'var(--gutter-card-tight)',
  md: 'var(--gutter-card)',
  lg: 'var(--gutter-panel)'
};
function Card({
  ground = 'ink',
  padding = 'md',
  interactive = false,
  selected = false,
  accent,
  children,
  style,
  ...rest
}) {
  const [hot, setHot] = React.useState(false);
  const css = {
    ...(cardGrounds[ground] || cardGrounds.ink),
    padding: cardPads[padding] ?? cardPads.md,
    transition: 'var(--transition-control)',
    ...(accent ? {
      borderTop: `var(--rule-accent) solid ${accent}`
    } : null),
    ...(interactive ? {
      cursor: 'pointer'
    } : null),
    ...(interactive && hot ? {
      background: ground === 'paper' ? 'var(--surface-paper-sunk)' : 'var(--surface-raised)',
      borderColor: 'var(--border-subtle)'
    } : null),
    ...(selected ? {
      borderColor: 'var(--border-accent)',
      background: ground === 'paper' ? 'var(--surface-paper)' : 'var(--surface-selected)'
    } : null),
    ...style
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: css,
    onMouseEnter: interactive ? () => setHot(true) : undefined,
    onMouseLeave: interactive ? () => setHot(false) : undefined
  }, rest), children);
}
function CardHeader({
  title,
  meta,
  action,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 'var(--space-4)',
      marginBottom: 'var(--space-3)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-1)',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-caps)',
      color: 'var(--text-faint)'
    }
  }, meta), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-heading)',
      color: 'var(--text-strong)'
    }
  }, title)), action);
}
Object.assign(__ds_scope, { Card, CardHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Lucide glyph rendered as a CSS mask so it inherits `currentColor`. */
function Icon({
  name,
  size = 16,
  strokeWidth,
  style,
  ...rest
}) {
  const url = `https://unpkg.com/lucide-static@0.454.0/icons/${name}.svg`;
  return /*#__PURE__*/React.createElement("span", _extends({
    "aria-hidden": "true",
    "data-icon": name,
    style: {
      display: 'inline-block',
      flex: '0 0 auto',
      width: size,
      height: size,
      background: 'currentColor',
      WebkitMask: `url("${url}") center / contain no-repeat`,
      mask: `url("${url}") center / contain no-repeat`,
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Field({
  label,
  hint,
  error,
  required = false,
  provenance,
  htmlFor,
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-1-5)',
      ...style
    }
  }, rest), label ? /*#__PURE__*/React.createElement("label", {
    htmlFor: htmlFor,
    style: {
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 'var(--space-1) var(--space-2)',
      font: 'var(--type-label)',
      lineHeight: 1.35,
      color: 'var(--text-body)'
    }
  }, /*#__PURE__*/React.createElement("span", null, label, required ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--status-fail)',
      marginLeft: 2
    }
  }, "*") : null), provenance ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-caps)',
      color: provenance === 'edited' ? 'var(--edited)' : 'var(--derived)'
    }
  }, provenance) : null) : null, children, error ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--status-fail)'
    }
  }, error) : hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-faint)',
      maxWidth: 'var(--measure-ui)'
    }
  }, hint) : null);
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const controlSurface = {
  width: '100%',
  background: 'var(--surface-input)',
  color: 'var(--text-strong)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-control)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-base)',
  transition: 'var(--transition-control)',
  outline: 'none',
  appearance: 'none'
};
function Input({
  size = 'md',
  invalid = false,
  mono = false,
  icon,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const heights = {
    sm: 'var(--control-height-sm)',
    md: 'var(--control-height)',
    lg: 'var(--control-height-lg)'
  };
  const css = {
    ...controlSurface,
    height: heights[size] || heights.md,
    padding: icon ? '0 var(--space-3) 0 var(--space-8)' : '0 var(--space-3)',
    fontSize: size === 'lg' ? 'var(--text-md)' : 'var(--text-base)',
    ...(mono ? {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-sm)'
    } : null),
    ...(invalid ? {
      borderColor: 'var(--border-danger)'
    } : null),
    ...(focus ? {
      borderColor: 'var(--border-focus)',
      boxShadow: '0 0 0 3px var(--accent-quiet)'
    } : null),
    ...style
  };
  const field = /*#__PURE__*/React.createElement("input", _extends({
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: css
  }, rest));
  if (!icon) return field;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 'var(--space-3)',
      top: 0,
      bottom: 0,
      display: 'flex',
      alignItems: 'center',
      color: focus ? 'var(--text-accent)' : 'var(--text-faint)',
      pointerEvents: 'none',
      transition: 'var(--transition-control)'
    }
  }, icon), field);
}
Object.assign(__ds_scope, { controlSurface, Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Select({
  options = [],
  size = 'md',
  invalid = false,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const heights = {
    sm: 'var(--control-height-sm)',
    md: 'var(--control-height)',
    lg: 'var(--control-height-lg)'
  };
  const caret = 'https://unpkg.com/lucide-static@0.454.0/icons/chevron-down.svg';
  const css = {
    ...__ds_scope.controlSurface,
    height: heights[size] || heights.md,
    padding: '0 var(--space-8) 0 var(--space-3)',
    ...(invalid ? {
      borderColor: 'var(--border-danger)'
    } : null),
    ...(focus ? {
      borderColor: 'var(--border-focus)',
      boxShadow: '0 0 0 3px var(--accent-quiet)'
    } : null),
    ...style
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: css
  }, rest), options.map(o => {
    const opt = typeof o === 'string' ? {
      value: o,
      label: o
    } : o;
    return /*#__PURE__*/React.createElement("option", {
      key: opt.value,
      value: opt.value
    }, opt.label);
  })), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      right: 'var(--space-3)',
      top: '50%',
      marginTop: -7,
      width: 14,
      height: 14,
      background: 'var(--text-faint)',
      WebkitMask: `url("${caret}") center / contain no-repeat`,
      mask: `url("${caret}") center / contain no-repeat`,
      pointerEvents: 'none'
    }
  }));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Textarea({
  rows = 5,
  invalid = false,
  prose = false,
  resize = 'vertical',
  counter,
  value,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const css = {
    ...__ds_scope.controlSurface,
    minHeight: rows * 22 + 18,
    padding: 'var(--space-3)',
    resize,
    lineHeight: prose ? 'var(--leading-prose)' : 'var(--leading-normal)',
    ...(prose ? {
      fontFamily: 'var(--font-serif)',
      fontSize: 'var(--text-md)'
    } : null),
    ...(invalid ? {
      borderColor: 'var(--border-danger)'
    } : null),
    ...(focus ? {
      borderColor: 'var(--border-focus)',
      boxShadow: '0 0 0 3px var(--accent-quiet)'
    } : null),
    ...style
  };
  const area = /*#__PURE__*/React.createElement("textarea", _extends({
    rows: rows,
    value: value,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: css
  }, rest));
  if (!counter) return area;
  const words = String(value || '').trim() ? String(value).trim().split(/\s+/).length : 0;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      position: 'relative'
    }
  }, area, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 'var(--space-3)',
      bottom: 'var(--space-2)',
      font: 'var(--type-data)',
      fontSize: 'var(--text-2xs)',
      color: 'var(--text-faint)',
      whiteSpace: 'nowrap'
    }
  }, words, " words"));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/pipeline/ProsodyStat.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** One prosody measurement: label, mono value, and the corpus band the draft is scored against. */
function ProsodyStat({
  label,
  value,
  unit,
  band,
  target,
  status = 'neutral',
  style,
  ...rest
}) {
  const tone = status === 'pass' ? 'var(--status-pass)' : status === 'drift' ? 'var(--status-drift)' : status === 'fail' ? 'var(--status-fail)' : 'var(--text-strong)';
  const pct = band && typeof value === 'number' ? Math.max(0, Math.min(100, (value - band[0]) / (band[1] - band[0]) * 100)) : null;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-1-5)',
      minWidth: 0,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 'var(--space-3)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-muted)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-data)',
      color: tone,
      fontVariantNumeric: 'tabular-nums'
    }
  }, value, unit ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-faint)'
    }
  }, unit) : null)), band ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height: 4,
      background: 'var(--track)',
      borderRadius: 'var(--radius-round)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      inset: 0,
      left: '18%',
      right: '18%',
      background: 'var(--measured-tint)',
      borderRadius: 'var(--radius-round)'
    }
  }), target != null && typeof target === 'number' ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: -2,
      bottom: -2,
      width: 1,
      left: `${Math.max(0, Math.min(100, (target - band[0]) / (band[1] - band[0]) * 100))}%`,
      background: 'var(--border-strong)'
    }
  }) : null, pct != null ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: -3,
      left: `${pct}%`,
      width: 2,
      height: 10,
      marginLeft: -1,
      background: tone,
      borderRadius: 1
    }
  }) : null) : null, band ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      font: 'var(--type-data)',
      fontSize: 'var(--text-3xs)',
      color: 'var(--text-faint)'
    }
  }, /*#__PURE__*/React.createElement("span", null, band[0]), /*#__PURE__*/React.createElement("span", null, band[1])) : null);
}
Object.assign(__ds_scope, { ProsodyStat });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/pipeline/ProsodyStat.jsx", error: String((e && e.message) || e) }); }

// components/pipeline/ProvenanceMark.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Marks whether a style-card field is evidence-derived, measured, or user-edited. */
function ProvenanceMark({
  origin = 'derived',
  source,
  onReset,
  style,
  ...rest
}) {
  const face = {
    measured: {
      color: 'var(--measured)',
      text: 'measured'
    },
    derived: {
      color: 'var(--derived)',
      text: 'derived'
    },
    edited: {
      color: 'var(--edited)',
      text: 'edited'
    }
  }[origin] || {
    color: 'var(--derived)',
    text: origin
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-1-5)',
      font: 'var(--type-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-caps)',
      color: face.color,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 5,
      height: 5,
      background: face.color,
      transform: 'rotate(45deg)',
      flex: '0 0 auto'
    }
  }), face.text, source ? /*#__PURE__*/React.createElement("span", {
    style: {
      textTransform: 'none',
      letterSpacing: 'var(--tracking-normal)',
      fontFamily: 'var(--font-serif)',
      fontStyle: 'italic',
      fontSize: 'var(--text-xs)',
      fontWeight: 400,
      color: 'var(--text-faint)'
    }
  }, source) : null, origin === 'edited' && onReset ? /*#__PURE__*/React.createElement("button", {
    onClick: onReset,
    style: {
      background: 'none',
      border: 'none',
      padding: 0,
      font: 'inherit',
      color: 'var(--text-faint)',
      textDecoration: 'underline',
      cursor: 'pointer'
    }
  }, "reset") : null);
}
Object.assign(__ds_scope, { ProvenanceMark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/pipeline/ProvenanceMark.jsx", error: String((e && e.message) || e) }); }

// components/pipeline/Thinking.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const stateFace = {
  pending: {
    dot: 'var(--dot-pending)',
    label: 'var(--text-faint)'
  },
  running: {
    dot: 'var(--status-running)',
    label: 'var(--text-body)'
  },
  done: {
    dot: 'var(--status-pass)',
    label: 'var(--text-muted)'
  },
  failed: {
    dot: 'var(--status-fail)',
    label: 'var(--status-fail)'
  }
};

/** A pipeline stage in progress: stage name, tier, elapsed, and streamed detail lines. */
function Thinking({
  stage,
  tier,
  state = 'running',
  detail = [],
  elapsed,
  open = true,
  children,
  style,
  ...rest
}) {
  const face = stateFace[state] || stateFace.running;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--surface-panel)',
      border: '1px solid var(--border-hairline)',
      borderRadius: 'var(--radius-card)',
      padding: 'var(--space-3) var(--space-4)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 'var(--radius-round)',
      background: face.dot,
      flex: '0 0 auto',
      animation: state === 'running' ? 'auteur-pulse 1.3s var(--ease-in-out) infinite' : 'none'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-data)',
      color: face.label,
      letterSpacing: 'var(--tracking-normal)'
    }
  }, stage), tier ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-caps)',
      color: `var(--tier-${tier})`
    }
  }, tier) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), elapsed ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-data)',
      fontSize: 'var(--text-2xs)',
      color: 'var(--text-faint)'
    }
  }, elapsed) : null), open && (detail.length || children) ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-1)',
      paddingLeft: 'var(--space-4)',
      borderLeft: '1px solid var(--border-hairline)',
      marginLeft: 2
    }
  }, detail.map((d, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      font: 'var(--type-data)',
      fontSize: 'var(--text-xs)',
      color: i === detail.length - 1 && state === 'running' ? 'var(--text-muted)' : 'var(--text-faint)',
      animation: 'auteur-fade-up var(--dur-base) var(--ease-out)'
    }
  }, d)), children) : null);
}
Object.assign(__ds_scope, { Thinking });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/pipeline/Thinking.jsx", error: String((e && e.message) || e) }); }

// components/pipeline/WizardRail.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** The wizard's seven steps as a fixed left rail. Completed steps are re-enterable. */
function WizardRail({
  steps = [],
  current = 0,
  onStep,
  header,
  footer,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("nav", _extends({
    style: {
      width: 'var(--rail-width)',
      flex: '0 0 auto',
      background: 'var(--surface-panel)',
      borderRight: '1px solid var(--border-hairline)',
      padding: 'var(--space-5) 0',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-5)',
      ...style
    }
  }, rest), header ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 var(--space-5)'
    }
  }, header) : null, /*#__PURE__*/React.createElement("ol", {
    style: {
      listStyle: 'none',
      margin: 0,
      padding: 0,
      display: 'flex',
      flexDirection: 'column'
    }
  }, steps.map((s, i) => {
    const state = i < current ? 'done' : i === current ? 'current' : 'pending';
    const enterable = state !== 'pending' && !!onStep;
    return /*#__PURE__*/React.createElement("li", {
      key: s.id || i
    }, /*#__PURE__*/React.createElement("button", {
      onClick: enterable ? () => onStep(i) : undefined,
      disabled: !enterable,
      style: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) var(--space-5)',
        background: state === 'current' ? 'var(--surface-selected)' : 'transparent',
        border: 'none',
        borderLeft: `var(--rule-medium) solid ${state === 'current' ? 'var(--accent)' : 'transparent'}`,
        textAlign: 'left',
        cursor: enterable ? 'pointer' : 'default',
        transition: 'var(--transition-control)',
        color: state === 'current' ? 'var(--text-strong)' : state === 'done' ? 'var(--text-muted)' : 'var(--text-faint)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-data)',
        fontSize: 'var(--text-2xs)',
        color: state === 'done' ? 'var(--status-pass)' : 'inherit',
        width: 12,
        flex: '0 0 auto'
      }
    }, state === 'done' ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: "check",
      size: 11
    }) : i + 1), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-label)',
        fontWeight: state === 'current' ? 600 : 400,
        flex: 1,
        minWidth: 0
      }
    }, s.label), s.note ? /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-data)',
        fontSize: 'var(--text-3xs)',
        color: 'var(--text-faint)'
      }
    }, s.note) : null));
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 var(--space-5)'
    }
  }, footer) : null);
}
Object.assign(__ds_scope, { WizardRail });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/pipeline/WizardRail.jsx", error: String((e && e.message) || e) }); }

// components/prose/Exemplar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** A verbatim passage from the corpus. Never editable — an edited quote is not a citation. */
function Exemplar({
  text,
  work,
  year,
  demonstrates,
  selected,
  onSelect,
  style,
  ...rest
}) {
  const [hot, setHot] = React.useState(false);
  return /*#__PURE__*/React.createElement("figure", _extends({
    onClick: onSelect,
    onMouseEnter: () => setHot(true),
    onMouseLeave: () => setHot(false),
    style: {
      margin: 0,
      background: 'var(--surface-paper)',
      color: 'var(--text-paper)',
      borderRadius: 'var(--radius-paper)',
      padding: 'var(--space-5)',
      boxShadow: selected ? 'var(--shadow-paper), 0 0 0 2px var(--prussian-600)' : 'var(--shadow-paper)',
      cursor: onSelect ? 'pointer' : 'default',
      transform: hot && onSelect ? 'translateY(-1px)' : 'none',
      transition: 'transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("blockquote", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-serif)',
      fontSize: 'var(--text-md)',
      lineHeight: 'var(--leading-prose)',
      textWrap: 'pretty'
    }
  }, text), /*#__PURE__*/React.createElement("figcaption", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 'var(--space-4)',
      borderTop: '1px solid var(--border-paper)',
      paddingTop: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement("cite", {
    style: {
      font: 'var(--type-caption)',
      fontStyle: 'normal',
      color: 'var(--text-paper-muted)'
    }
  }, work, year ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-paper-faint)'
    }
  }, ", ", year) : null), demonstrates ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-caps)',
      color: 'var(--prussian-700)',
      textAlign: 'right'
    }
  }, demonstrates) : null));
}
Object.assign(__ds_scope, { Exemplar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/prose/Exemplar.jsx", error: String((e && e.message) || e) }); }

// components/prose/Markdown.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* A deliberately small markdown renderer — headings, paragraphs, em/strong,
   blockquote, hr, lists, code spans. Enough for story prose, outlines and
   critique findings; not a general-purpose parser. */
function inline(src) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
  let last = 0,
    m;
  while (m = re.exec(src)) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(/*#__PURE__*/React.createElement("strong", {
      key: m.index,
      style: {
        fontWeight: 600
      }
    }, t.slice(2, -2)));else if (t.startsWith('`')) out.push(/*#__PURE__*/React.createElement("code", {
      key: m.index,
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: '0.88em',
        background: 'var(--surface-raised)',
        padding: '1px 4px',
        borderRadius: 'var(--radius-xs)'
      }
    }, t.slice(1, -1)));else out.push(/*#__PURE__*/React.createElement("em", {
      key: m.index,
      style: {
        fontStyle: 'italic'
      }
    }, t.slice(1, -1)));
    last = m.index + t.length;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}
function Markdown({
  children = '',
  ground = 'ink',
  size = 'md',
  streaming = false,
  style,
  ...rest
}) {
  const paper = ground === 'paper';
  const blocks = String(children).replace(/\r/g, '').split(/\n{2,}/).filter(b => b.trim());
  const body = paper ? 'var(--text-paper)' : 'var(--text-body)';
  const muted = paper ? 'var(--text-paper-muted)' : 'var(--text-muted)';
  const fs = size === 'sm' ? 'var(--text-base)' : size === 'lg' ? 'var(--text-lg)' : 'var(--text-md)';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      fontFamily: 'var(--font-serif)',
      fontSize: fs,
      lineHeight: 'var(--leading-prose)',
      color: body,
      maxWidth: 'var(--measure-prose)',
      display: 'flex',
      flexDirection: 'column',
      gap: '1em',
      ...style
    }
  }, rest), blocks.map((b, i) => {
    const t = b.trim();
    const last = i === blocks.length - 1;
    const caret = streaming && last ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-block',
        width: '0.42em',
        height: '1em',
        marginLeft: '0.1em',
        background: 'var(--accent)',
        verticalAlign: '-0.14em',
        animation: 'auteur-caret 1s steps(1) infinite'
      }
    }) : null;
    if (t === '---' || t === '***') return /*#__PURE__*/React.createElement("hr", {
      key: i,
      style: {
        border: 'none',
        borderTop: '1px solid ' + (paper ? 'var(--border-paper)' : 'var(--border-subtle)'),
        width: '4em',
        margin: '0.6em auto'
      }
    });
    if (t.startsWith('### ')) return /*#__PURE__*/React.createElement("h3", {
      key: i,
      style: {
        font: 'var(--type-heading)',
        fontFamily: 'var(--font-sans)',
        color: body,
        textTransform: 'none',
        marginTop: '0.4em'
      }
    }, inline(t.slice(4)));
    if (t.startsWith('## ')) return /*#__PURE__*/React.createElement("h2", {
      key: i,
      style: {
        fontFamily: 'var(--font-serif)',
        fontSize: 'var(--text-xl)',
        fontWeight: 400,
        lineHeight: 'var(--leading-snug)',
        color: body,
        marginTop: '0.3em'
      }
    }, inline(t.slice(3)));
    if (t.startsWith('# ')) return /*#__PURE__*/React.createElement("h1", {
      key: i,
      style: {
        fontFamily: 'var(--font-serif)',
        fontSize: 'var(--text-2xl)',
        fontWeight: 400,
        lineHeight: 'var(--leading-snug)',
        color: body
      }
    }, inline(t.slice(2)));
    if (t.startsWith('> ')) return /*#__PURE__*/React.createElement("blockquote", {
      key: i,
      style: {
        margin: 0,
        paddingLeft: '1em',
        borderLeft: '2px solid ' + (paper ? 'var(--border-paper)' : 'var(--border-strong)'),
        color: muted,
        fontStyle: 'italic'
      }
    }, inline(t.replace(/^> ?/gm, '')));
    if (/^(\d+\.|[-*]) /.test(t)) {
      const ordered = /^\d+\./.test(t);
      const items = t.split('\n').map(l => l.replace(/^(\d+\.|[-*]) ?/, ''));
      const List = ordered ? 'ol' : 'ul';
      return /*#__PURE__*/React.createElement(List, {
        key: i,
        style: {
          margin: 0,
          paddingLeft: '1.4em',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35em'
        }
      }, items.map((it, j) => /*#__PURE__*/React.createElement("li", {
        key: j
      }, inline(it))));
    }
    return /*#__PURE__*/React.createElement("p", {
      key: i,
      style: {
        margin: 0,
        textIndent: paper && i > 0 ? '1.4em' : 0,
        textWrap: 'pretty'
      }
    }, inline(t), caret);
  }));
}
Object.assign(__ds_scope, { Markdown });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/prose/Markdown.jsx", error: String((e && e.message) || e) }); }

// components/theme/ThemeToggle.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const MODES = [{
  id: 'auto',
  icon: 'clock',
  label: 'Auto'
}, {
  id: 'light',
  icon: 'sun',
  label: 'Light'
}, {
  id: 'dark',
  icon: 'moon',
  label: 'Dark'
}];
function glyph(name, size) {
  const url = `https://unpkg.com/lucide-static@0.454.0/icons/${name}.svg`;
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    "data-icon": name,
    style: {
      display: 'inline-block',
      flex: '0 0 auto',
      width: size,
      height: size,
      background: 'currentColor',
      WebkitMask: `url("${url}") center / contain no-repeat`,
      mask: `url("${url}") center / contain no-repeat`
    }
  });
}
function byTime() {
  const h = new Date().getHours();
  return h >= 6 && h < 18 ? 'light' : 'dark';
}

/** Auto / Light / Dark segmented control. Uncontrolled by default: reads and
 *  writes window.AuteurTheme (assets/theme.js) when present, and falls back to
 *  setting data-theme on <html> itself. */
function ThemeToggle({
  mode,
  onChange,
  size = 'md',
  showLabels = false,
  style,
  ...rest
}) {
  const api = typeof window === 'undefined' ? null : window.AuteurTheme;
  const [local, setLocal] = React.useState(() => mode || (api ? api.get() : 'auto'));
  const active = mode || local;
  const controlled = mode != null;
  React.useEffect(() => {
    if (controlled) return undefined;
    const root = document.documentElement;
    const onExternal = e => setLocal(e.detail.mode);
    root.addEventListener('auteurthemechange', onExternal);
    return () => root.removeEventListener('auteurthemechange', onExternal);
  }, [controlled]);
  const pick = id => {
    if (!controlled) setLocal(id);
    if (api) api.set(id);else document.documentElement.dataset.theme = id === 'auto' ? byTime() : id;
    if (onChange) onChange(id);
  };
  const h = size === 'sm' ? 22 : 26;
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "radiogroup",
    "aria-label": "Theme",
    style: {
      display: 'inline-flex',
      gap: 1,
      padding: 2,
      background: 'var(--surface-input)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-control)',
      ...style
    }
  }, rest), MODES.map(m => {
    const on = m.id === active;
    return /*#__PURE__*/React.createElement("button", {
      key: m.id,
      type: "button",
      role: "radio",
      "aria-checked": on,
      title: m.label,
      onClick: () => pick(m.id),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1-5)',
        height: h,
        padding: showLabels ? '0 var(--space-2)' : 0,
        width: showLabels ? 'auto' : h + 4,
        justifyContent: 'center',
        cursor: 'pointer',
        appearance: 'none',
        border: '1px solid transparent',
        borderRadius: 'var(--radius-xs)',
        background: on ? 'var(--surface-active)' : 'transparent',
        color: on ? 'var(--text-strong)' : 'var(--text-faint)',
        font: 'var(--type-label)',
        letterSpacing: 'var(--tracking-normal)',
        transition: 'var(--transition-control)'
      }
    }, glyph(m.icon, size === 'sm' ? 12 : 14), showLabels ? m.label : null);
  }));
}
Object.assign(__ds_scope, { ThemeToggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/theme/ThemeToggle.jsx", error: String((e && e.message) || e) }); }

// ui_kits/auteur-web/App.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function App() {
  const D = window.AUTEUR_DATA;
  const [step, setStep] = React.useState(0);
  const [state, setState] = React.useState({
    idea: 'A lighthouse keeper stops writing in the log, and the log keeps writing itself.',
    constraints: '',
    length: 'short',
    author: 'borges'
  });
  const set = patch => setState(s => ({
    ...s,
    ...patch
  }));
  const next = () => setStep(s => Math.min(6, s + 1));
  const back = () => setStep(s => Math.max(0, s - 1));
  const spend = ['$0.00', '$0.00', '$0.02', '$0.03', '$0.04', '$0.13', '$0.14'][step];
  const props = {
    state,
    set,
    onNext: next,
    onBack: back
  };
  return /*#__PURE__*/React.createElement(AppShell, {
    steps: D.steps,
    current: step,
    onStep: setStep,
    session: {
      id: 'local-4f2a',
      spend
    }
  }, step === 0 ? /*#__PURE__*/React.createElement(IdeaStep, props) : null, step === 1 ? /*#__PURE__*/React.createElement(AuthorStep, props) : null, step === 2 ? /*#__PURE__*/React.createElement(ResearchStep, props) : null, step === 3 ? /*#__PURE__*/React.createElement(ClarifyStep, props) : null, step === 4 ? /*#__PURE__*/React.createElement(OutlineStep, props) : null, step === 5 ? /*#__PURE__*/React.createElement(DraftStep, props) : null, step === 6 ? /*#__PURE__*/React.createElement(ResultStep, _extends({}, props, {
    onRestart: () => setStep(0)
  })) : null);
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/auteur-web/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/auteur-web/AuthorStep.jsx
try { (() => {
const {
  Button,
  Input,
  Icon,
  Badge,
  Card
} = window.AuteurDesignSystem_11e1bd;
function AuthorStep({
  state,
  set,
  onNext,
  onBack
}) {
  const D = window.AUTEUR_DATA;
  const [q, setQ] = React.useState('');
  const list = D.authors.filter(a => a.name.toLowerCase().includes(q.toLowerCase()));
  const chosen = D.authors.find(a => a.id === state.author);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(StepHeader, {
    index: 2,
    title: "In whose voice?",
    blurb: "Search the corpus index. Only authors with public-domain full text can carry a computed prosody block.",
    aside: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 'var(--space-2)',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement(Badge, {
      tone: "measured"
    }, "full-text"), /*#__PURE__*/React.createElement(Badge, {
      tone: "neutral"
    }, "secondary"))
  }), /*#__PURE__*/React.createElement(StepBody, null, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 760,
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    size: "lg",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "search",
      size: 16
    }),
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "Search authors in the corpus index\u2026"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)'
    }
  }, list.map(a => {
    const on = a.id === state.author;
    const off = a.provenance === 'secondary';
    return /*#__PURE__*/React.createElement(Card, {
      key: a.id,
      ground: "outline",
      padding: "sm",
      interactive: !off,
      selected: on,
      onClick: off ? undefined : () => set({
        author: a.id
      }),
      style: {
        opacity: off ? 0.55 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 14,
        height: 14,
        borderRadius: 'var(--radius-round)',
        border: `1px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`,
        background: on ? 'var(--accent)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-on-accent)',
        flex: '0 0 auto'
      }
    }, on ? /*#__PURE__*/React.createElement(Icon, {
      name: "check",
      size: 9
    }) : null), /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0,
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 'var(--space-2)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-serif)',
        fontSize: 'var(--text-md)',
        color: 'var(--text-strong)'
      }
    }, a.name), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-data)',
        fontSize: 'var(--text-2xs)',
        color: 'var(--text-faint)'
      }
    }, a.dates)), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-caption)',
        color: 'var(--text-muted)'
      }
    }, a.note)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        flex: '0 0 auto'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-data)',
        fontSize: 'var(--text-2xs)',
        color: 'var(--text-faint)',
        textAlign: 'right'
      }
    }, a.works ? `${a.works} works` : 'no primary text', /*#__PURE__*/React.createElement("br", null), a.words, " words"), /*#__PURE__*/React.createElement(Badge, {
      tone: off ? 'neutral' : 'measured'
    }, a.provenance)));
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-faint)',
      maxWidth: 'var(--measure-ui)'
    }
  }, "A ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }, "secondary"), " card is built from interviews and criticism, has no computed prosody and no verbatim exemplars, and gets a lower confidence. Not available in v1."))), /*#__PURE__*/React.createElement(StepFooter, {
    back: "Idea",
    onBack: onBack
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    disabled: !chosen,
    onClick: onNext
  }, "Build the style card", /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 14
  }))));
}
Object.assign(window, {
  AuthorStep
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/auteur-web/AuthorStep.jsx", error: String((e && e.message) || e) }); }

// ui_kits/auteur-web/ClarifyStep.jsx
try { (() => {
const {
  Button,
  Icon,
  Badge,
  Card,
  Textarea
} = window.AuteurDesignSystem_11e1bd;
function ClarifyStep({
  state,
  set,
  onNext,
  onBack
}) {
  const D = window.AUTEUR_DATA;
  const [answers, setAnswers] = React.useState(() => {
    const seed = {};
    D.questions.forEach(q => {
      if (q.answer) seed[q.id] = q.answer;
    });
    return seed;
  });
  const [round, setRound] = React.useState(1);
  const visible = D.questions.filter(q => q.round <= round);
  const answered = visible.filter(q => answers[q.id]).length;
  const roundDone = visible.every(q => answers[q.id] !== undefined);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(StepHeader, {
    index: 4,
    title: "Three things are still ambiguous",
    blurb: "Answer them, or skip and the model chooses \u2014 every choice it makes is recorded in the decisions log.",
    aside: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 'var(--space-2)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-data)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-faint)'
      }
    }, "round ", round, " of 3 \xB7 ", answered, "/8 questions"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 3
      }
    }, [0, 1, 2, 3, 4, 5, 6, 7].map(i => /*#__PURE__*/React.createElement("span", {
      key: i,
      style: {
        width: 16,
        height: 3,
        background: i < answered ? 'var(--accent)' : 'var(--track)'
      }
    }))))
  }), /*#__PURE__*/React.createElement(StepBody, null, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 780,
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-5)'
    }
  }, visible.map((q, i) => /*#__PURE__*/React.createElement(QuestionBlock, {
    key: q.id,
    q: q,
    n: i + 1,
    answer: answers[q.id],
    onAnswer: v => setAnswers({
      ...answers,
      [q.id]: v
    })
  })), round === 1 && roundDone ? /*#__PURE__*/React.createElement(Card, {
    ground: "outline",
    padding: "sm",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-accent)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "git-branch",
    size: 16
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body)',
      color: 'var(--text-muted)',
      flex: 1
    }
  }, "Your answer to q1 opened one new decision. A follow-up round is available."), /*#__PURE__*/React.createElement(Button, {
    variant: "quiet",
    size: "sm",
    onClick: () => setRound(2)
  }, "Show it")) : null)), /*#__PURE__*/React.createElement(StepFooter, {
    back: "Research",
    onBack: onBack
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-faint)'
    }
  }, "Skipping is never blocked."), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    onClick: onNext
  }, "Generate now"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    onClick: onNext
  }, "Outline", /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 14
  }))));
}
function QuestionBlock({
  q,
  n,
  answer,
  onAnswer
}) {
  const [own, setOwn] = React.useState('');
  const skipped = answer === '__skip';
  return /*#__PURE__*/React.createElement(Card, {
    ground: "ink",
    padding: "md",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)',
      opacity: skipped ? 0.6 : 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-data)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-faint)',
      marginTop: 4
    }
  }, "q", n), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-serif)',
      fontSize: 'var(--text-lg)',
      fontWeight: 400,
      lineHeight: 'var(--leading-snug)',
      color: 'var(--text-strong)',
      textWrap: 'pretty'
    }
  }, q.text), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-faint)',
      maxWidth: 'var(--measure-prose)',
      lineHeight: 'var(--leading-normal)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-accent)'
    }
  }, "Why asked \u2014 "), q.why))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 'var(--space-2)',
      paddingLeft: 'var(--space-8)'
    }
  }, q.suggestions.map(s => {
    const on = answer === s;
    return /*#__PURE__*/React.createElement(Button, {
      key: s,
      size: "sm",
      variant: on ? 'primary' : 'quiet',
      onClick: () => onAnswer(s)
    }, on ? /*#__PURE__*/React.createElement(Icon, {
      name: "check",
      size: 12
    }) : null, s);
  }), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    onClick: () => onAnswer('__skip')
  }, skipped ? 'Skipped — model chooses' : 'You decide')), answer && !skipped ? /*#__PURE__*/React.createElement("div", {
    style: {
      paddingLeft: 'var(--space-8)'
    }
  }, /*#__PURE__*/React.createElement(Textarea, {
    rows: 1,
    value: own,
    onChange: e => setOwn(e.target.value),
    placeholder: "Add a note to this answer (optional)"
  })) : null);
}
Object.assign(window, {
  ClarifyStep
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/auteur-web/ClarifyStep.jsx", error: String((e && e.message) || e) }); }

// ui_kits/auteur-web/DraftStep.jsx
try { (() => {
const {
  Button,
  Icon,
  Badge,
  Card,
  Markdown,
  Thinking,
  ProsodyStat
} = window.AuteurDesignSystem_11e1bd;
function DraftStep({
  onNext,
  onBack
}) {
  const D = window.AUTEUR_DATA;
  const [chars, setChars] = React.useState(0);
  React.useEffect(() => {
    if (chars >= D.draft.length) return;
    const t = setTimeout(() => setChars(Math.min(D.draft.length, chars + 14)), 22);
    return () => clearTimeout(t);
  }, [chars]);
  const streaming = chars < D.draft.length;
  const words = D.draft.slice(0, chars).trim().split(/\s+/).filter(Boolean).length;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(StepHeader, {
    index: 6,
    title: streaming ? 'Drafting' : 'Draft complete',
    blurb: "Prose streams as it is written. You can leave and come back \u2014 the session is persisted.",
    aside: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)'
      }
    }, /*#__PURE__*/React.createElement(Badge, {
      tone: "strong"
    }, "strong"), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-data)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-faint)'
      }
    }, words, " / ~940 words"))
  }), /*#__PURE__*/React.createElement(StepBody, {
    style: {
      background: 'var(--surface-panel)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) 260px',
      gap: 'var(--space-10)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    ground: "paper",
    padding: "lg",
    style: {
      padding: '48px 56px'
    }
  }, /*#__PURE__*/React.createElement(Markdown, {
    ground: "paper",
    streaming: streaming
  }, D.draft.slice(0, chars))), /*#__PURE__*/React.createElement("aside", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-5)',
      position: 'sticky',
      top: 0
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionLabel, null, "Live prosody"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)'
    }
  }, /*#__PURE__*/React.createElement(ProsodyStat, {
    label: "Mean sentence length",
    value: 31.2,
    unit: " w",
    band: [6, 52],
    target: 24.6,
    status: "drift"
  }), /*#__PURE__*/React.createElement(ProsodyStat, {
    label: "Semicolon",
    value: 5.9,
    unit: "/1k",
    band: [0, 14],
    target: 6.4,
    status: "pass"
  }), /*#__PURE__*/React.createElement(ProsodyStat, {
    label: "Dialogue ratio",
    value: 0.0,
    band: [0, 1],
    target: 0.08,
    status: "pass"
  }))), /*#__PURE__*/React.createElement(Thinking, {
    stage: "draft",
    tier: "strong",
    state: streaming ? 'running' : 'done',
    elapsed: streaming ? '1m 12s' : '2m 31s',
    detail: streaming ? ['beat 3 of 7'] : ['7 beats drafted', 'handing to critique']
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "danger",
    size: "sm",
    fullWidth: true
  }, "Stop and keep what exists")))), /*#__PURE__*/React.createElement(StepFooter, {
    back: "Outline",
    onBack: onBack
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    disabled: streaming,
    onClick: onNext
  }, "Style-fit report", /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 14
  }))));
}
Object.assign(window, {
  DraftStep
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/auteur-web/DraftStep.jsx", error: String((e && e.message) || e) }); }

// ui_kits/auteur-web/IdeaStep.jsx
try { (() => {
const {
  Button,
  Field,
  Textarea,
  Select,
  Icon,
  Badge
} = window.AuteurDesignSystem_11e1bd;
function IdeaStep({
  state,
  set,
  onNext
}) {
  const D = window.AUTEUR_DATA;
  const preset = D.lengths.find(l => l.value === state.length) || D.lengths[1];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(StepHeader, {
    index: 1,
    title: "What is the story?",
    blurb: "One sentence or pages of notes. Nothing here is discarded \u2014 the idea is sent to every stage of the pipeline."
  }), /*#__PURE__*/React.createElement(StepBody, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) 260px',
      gap: 'var(--space-10)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Idea",
    required: true,
    hint: "Premise, image, constraint, or a page of notes \u2014 any length."
  }, /*#__PURE__*/React.createElement(Textarea, {
    prose: true,
    counter: true,
    rows: 9,
    value: state.idea,
    onChange: e => set({
      idea: e.target.value
    }),
    placeholder: "A lighthouse keeper stops writing in the log, and the log keeps writing itself."
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Hard constraints",
    hint: "Things the draft must or must not do. Optional."
  }, /*#__PURE__*/React.createElement(Textarea, {
    rows: 2,
    value: state.constraints,
    onChange: e => set({
      constraints: e.target.value
    }),
    placeholder: "No dialogue. Must end on a footnote."
  }))), /*#__PURE__*/React.createElement("aside", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Length",
    hint: "A preset selects a draft strategy, not a cap."
  }, /*#__PURE__*/React.createElement(Select, {
    value: state.length,
    onChange: e => set({
      length: e.target.value
    }),
    options: D.lengths
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-panel)',
      border: '1px solid var(--border-hairline)',
      borderRadius: 'var(--radius-card)',
      padding: 'var(--gutter-card-tight)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-caps)',
      color: 'var(--text-faint)'
    }
  }, "Resolved strategy"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "accent",
    mono: true
  }, preset.strategy)), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-muted)',
      lineHeight: 'var(--leading-normal)'
    }
  }, preset.strategy === 'single-call' ? 'One call. Best global coherence — the model holds the whole shape at once.' : 'One call per outline beat, each given the style card, the outline, a running story-state summary, and the last ~500 words verbatim.'))))), /*#__PURE__*/React.createElement(StepFooter, null, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-faint)'
    }
  }, "Nothing is generated yet."), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    disabled: !state.idea.trim(),
    onClick: onNext
  }, "Choose an author", /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 14
  }))));
}
Object.assign(window, {
  IdeaStep
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/auteur-web/IdeaStep.jsx", error: String((e && e.message) || e) }); }

// ui_kits/auteur-web/OutlineStep.jsx
try { (() => {
const {
  Button,
  Icon,
  Badge,
  Card,
  Markdown
} = window.AuteurDesignSystem_11e1bd;
function OutlineStep({
  onNext,
  onBack
}) {
  const D = window.AUTEUR_DATA;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(StepHeader, {
    index: 5,
    title: "Seven beats",
    blurb: "Approve, edit any beat, or regenerate. The draft stage receives this outline verbatim.",
    aside: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 'var(--space-2)'
      }
    }, /*#__PURE__*/React.createElement(Badge, {
      tone: "balanced"
    }, "balanced"), /*#__PURE__*/React.createElement(Badge, {
      tone: "neutral",
      mono: true
    }, "outline \xB7 4.1s"))
  }), /*#__PURE__*/React.createElement(StepBody, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) 280px',
      gap: 'var(--space-10)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    ground: "paper",
    padding: "lg"
  }, /*#__PURE__*/React.createElement(Markdown, {
    ground: "paper"
  }, D.outline)), /*#__PURE__*/React.createElement("aside", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionLabel, null, "Before drafting"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement(Estimate, {
    label: "Stage",
    value: "draft"
  }), /*#__PURE__*/React.createElement(Estimate, {
    label: "Tier",
    value: "strong"
  }), /*#__PURE__*/React.createElement(Estimate, {
    label: "Strategy",
    value: "single-call"
  }), /*#__PURE__*/React.createElement(Estimate, {
    label: "Est. tokens out",
    value: "6,200"
  }), /*#__PURE__*/React.createElement(Estimate, {
    label: "Est. cost",
    value: "$0.11",
    strong: true
  }), /*#__PURE__*/React.createElement(Estimate, {
    label: "Est. time",
    value: "2m 40s"
  }))), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-faint)',
      lineHeight: 'var(--leading-normal)'
    }
  }, "A novelette is roughly 5\xD7 a short story. You should choose that knowingly."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    fullWidth: true
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh-cw",
    size: 14
  }), "Regenerate outline"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    fullWidth: true
  }, "Edit beats"))))), /*#__PURE__*/React.createElement(StepFooter, {
    back: "Questions",
    onBack: onBack
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    onClick: onNext
  }, "Approve and draft", /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 14
  }))));
}
function Estimate({
  label,
  value,
  strong
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 'var(--space-3)',
      padding: 'var(--space-1-5) 0',
      borderBottom: '1px solid var(--border-hairline)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-muted)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-data)',
      color: strong ? 'var(--tier-strong)' : 'var(--text-body)'
    }
  }, value));
}
Object.assign(window, {
  OutlineStep,
  Estimate
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/auteur-web/OutlineStep.jsx", error: String((e && e.message) || e) }); }

// ui_kits/auteur-web/ResearchStep.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  Button,
  Icon,
  Badge,
  Card,
  Thinking,
  ProsodyStat,
  ProvenanceMark,
  Exemplar
} = window.AuteurDesignSystem_11e1bd;
function ResearchStep({
  onNext,
  onBack
}) {
  const D = window.AUTEUR_DATA;
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    if (n >= D.research.length) return;
    const t = setTimeout(() => setN(n + 1), n === 0 ? 700 : 1100);
    return () => clearTimeout(t);
  }, [n]);
  const done = n >= D.research.length;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(StepHeader, {
    index: 3,
    title: "Reading Borges",
    blurb: "Corpus selection, deterministic prosody, then extraction from cited passages. You do not have to do anything here.",
    aside: done ? /*#__PURE__*/React.createElement(Badge, {
      tone: "measured"
    }, "card v3 \xB7 confidence 0.91") : /*#__PURE__*/React.createElement(Badge, {
      tone: "accent"
    }, "building")
  }), /*#__PURE__*/React.createElement(StepBody, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(300px,380px) minmax(0,1fr)',
      gap: 'var(--space-10)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionLabel, null, "Pipeline"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)'
    }
  }, D.research.map((s, i) => /*#__PURE__*/React.createElement(Thinking, {
    key: s.stage,
    stage: s.stage,
    tier: s.tier || undefined,
    state: i < n ? 'done' : i === n ? 'running' : 'pending',
    elapsed: i <= n ? s.elapsed : undefined,
    detail: i <= n ? s.detail.slice(0, i < n ? s.detail.length : 2) : []
  }))), done ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement(SectionLabel, null, "Measured prosody"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)'
    }
  }, D.prosody.slice(0, 6).map(p => /*#__PURE__*/React.createElement(ProsodyStat, _extends({
    key: p.label
  }, p)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--space-3)'
    }
  }, /*#__PURE__*/React.createElement(ProvenanceMark, {
    origin: "measured",
    source: "412,118 words"
  }))) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      opacity: done ? 1 : 0.25,
      transition: 'opacity var(--dur-slow) var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement(StyleCardPanel, {
    card: D.card,
    exemplars: D.exemplars
  })))), /*#__PURE__*/React.createElement(StepFooter, {
    back: "Author",
    onBack: onBack
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    disabled: !done
  }, "Export card"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    disabled: !done,
    onClick: onNext
  }, "Answer 3 questions", /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 14
  }))));
}
function CardRow({
  path,
  value,
  origin,
  source
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '150px minmax(0,1fr)',
      gap: 'var(--space-4)',
      padding: 'var(--space-2) 0',
      borderBottom: '1px solid var(--border-hairline)',
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-data)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-faint)'
    }
  }, path), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-1)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body)',
      color: 'var(--text-body)'
    }
  }, value), /*#__PURE__*/React.createElement(ProvenanceMark, {
    origin: origin,
    source: source || undefined
  })));
}
function ChipList({
  items,
  tone = 'neutral'
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 'var(--space-1-5)'
    }
  }, items.map(t => /*#__PURE__*/React.createElement(Badge, {
    key: t,
    tone: tone,
    mono: true
  }, t)));
}
function StyleCardPanel({
  card,
  exemplars
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    ground: "panel",
    padding: "md"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 'var(--space-4)',
      marginBottom: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: 'var(--type-title)'
    }
  }, card.author), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "measured"
  }, card.provenance), /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral",
    mono: true
  }, card.version))), /*#__PURE__*/React.createElement(SectionLabel, null, "voice"), card.voice.map(r => /*#__PURE__*/React.createElement(CardRow, {
    key: r[0],
    path: `voice.${r[0]}`,
    value: r[1],
    origin: r[2],
    source: r[3]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 'var(--space-5)'
    }
  }), /*#__PURE__*/React.createElement(SectionLabel, null, "diction"), card.diction.map(r => /*#__PURE__*/React.createElement(CardRow, {
    key: r[0],
    path: `diction.${r[0]}`,
    value: r[1],
    origin: r[2],
    source: r[3]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '150px minmax(0,1fr)',
      gap: 'var(--space-4)',
      padding: 'var(--space-3) 0'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-data)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-faint)'
    }
  }, "signatureLexicon"), /*#__PURE__*/React.createElement(ChipList, {
    items: card.lexicon,
    tone: "accent"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '150px minmax(0,1fr)',
      gap: 'var(--space-4)',
      padding: '0 0 var(--space-3)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-data)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-faint)'
    }
  }, "avoidedRegisters"), /*#__PURE__*/React.createElement(ChipList, {
    items: card.avoided
  })), /*#__PURE__*/React.createElement(SectionLabel, null, "structure"), card.structure.map(r => /*#__PURE__*/React.createElement(CardRow, {
    key: r[0],
    path: `structure.${r[0]}`,
    value: r[1],
    origin: r[2],
    source: r[3]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 'var(--space-5)'
    }
  }), /*#__PURE__*/React.createElement(SectionLabel, null, "antiPatterns"), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      padding: 0,
      listStyle: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)'
    }
  }, card.antiPatterns.map(t => /*#__PURE__*/React.createElement("li", {
    key: t,
    style: {
      display: 'flex',
      gap: 'var(--space-2)',
      font: 'var(--type-body)',
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--status-fail)',
      flex: '0 0 auto',
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "minus",
    size: 14
  })), t)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionLabel, {
    action: /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-caption)',
        color: 'var(--text-faint)'
      }
    }, "14 cited \xB7 3 shown")
  }, "exemplars \u2014 verbatim, never editable"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)'
    }
  }, exemplars.map((e, i) => /*#__PURE__*/React.createElement(Exemplar, _extends({
    key: i
  }, e, {
    selected: i === 0,
    onSelect: () => {}
  }))))));
}
Object.assign(window, {
  ResearchStep,
  StyleCardPanel,
  CardRow,
  ChipList
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/auteur-web/ResearchStep.jsx", error: String((e && e.message) || e) }); }

// ui_kits/auteur-web/ResultStep.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  Button,
  Icon,
  Badge,
  Card,
  Markdown,
  ProsodyStat,
  ProvenanceMark
} = window.AuteurDesignSystem_11e1bd;
function ResultStep({
  onBack,
  onRestart
}) {
  const D = window.AUTEUR_DATA;
  const [tab, setTab] = React.useState('story');
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(StepHeader, {
    index: 7,
    title: "A Review of the Eddystone Log",
    blurb: "In the style of Jorge Luis Borges. AI-generated; not written by the author.",
    aside: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)'
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "download",
      size: 14
    }), "Export .md"), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      onClick: onRestart
    }, "New story"))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-1)',
      padding: '0 var(--gutter-screen)',
      borderBottom: '1px solid var(--border-hairline)'
    }
  }, [['story', 'Story'], ['fit', 'Style fit'], ['decisions', 'Decisions log']].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setTab(k),
    style: {
      background: 'none',
      border: 'none',
      borderBottom: `2px solid ${tab === k ? 'var(--accent)' : 'transparent'}`,
      padding: 'var(--space-3) var(--space-4)',
      font: 'var(--type-label)',
      cursor: 'pointer',
      color: tab === k ? 'var(--text-strong)' : 'var(--text-faint)',
      transition: 'var(--transition-control)'
    }
  }, l))), /*#__PURE__*/React.createElement(StepBody, {
    style: {
      background: tab === 'story' ? 'var(--surface-panel)' : 'var(--surface-app)'
    }
  }, tab === 'story' ? /*#__PURE__*/React.createElement(Card, {
    ground: "paper",
    padding: "lg",
    style: {
      padding: '56px 64px',
      maxWidth: 760,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement(Markdown, {
    ground: "paper"
  }, D.draft), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--space-10)',
      paddingTop: 'var(--space-3)',
      borderTop: '1px solid var(--border-paper)',
      font: 'var(--type-caption)',
      color: 'var(--text-paper-faint)'
    }
  }, "Generated by auteur in the style of Jorge Luis Borges. AI-generated text; not written by the author.")) : null, tab === 'fit' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) 320px',
      gap: 'var(--space-10)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionLabel, {
    action: /*#__PURE__*/React.createElement(Badge, {
      tone: "edited"
    }, "1 drift")
  }, "Findings \u2014 critique stage"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)'
    }
  }, D.findings.map((f, i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    ground: "ink",
    padding: "md",
    accent: f.status === 'pass' ? 'var(--status-pass)' : 'var(--status-drift)',
    style: {
      display: 'flex',
      gap: 'var(--space-3)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: f.status === 'pass' ? 'var(--status-pass)' : 'var(--status-drift)',
      flex: '0 0 auto',
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: f.status === 'pass' ? 'check' : 'trending-up',
    size: 15
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-body)',
      color: 'var(--text-body)',
      lineHeight: 'var(--leading-normal)',
      maxWidth: 'var(--measure-prose)'
    }
  }, f.text)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--space-5)',
      display: 'flex',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary"
  }, "Run targeted revision"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost"
  }, "Regenerate beat 3"))), /*#__PURE__*/React.createElement("aside", null, /*#__PURE__*/React.createElement(SectionLabel, null, "Draft vs corpus band"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)'
    }
  }, D.fit.map(p => /*#__PURE__*/React.createElement(ProsodyStat, _extends({
    key: p.label
  }, p)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--space-4)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement(ProvenanceMark, {
    origin: "measured",
    source: "corpus, 412,118 words"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-faint)',
      lineHeight: 'var(--leading-normal)'
    }
  }, "Hairline = prosodyTarget. Marker = the draft. Edited targets are scored separately and never reported as the author's statistics.")))) : null, tab === 'decisions' ? /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 720
    }
  }, /*#__PURE__*/React.createElement(SectionLabel, null, "Every choice the model made for you"), D.decisions.map(([k, v, how]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      display: 'grid',
      gridTemplateColumns: '150px minmax(0,1fr) 200px',
      gap: 'var(--space-4)',
      padding: 'var(--space-3) 0',
      borderBottom: '1px solid var(--border-hairline)',
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-data)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-faint)'
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body)',
      color: 'var(--text-body)'
    }
  }, v), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: how === 'answered' ? 'var(--text-muted)' : 'var(--edited)',
      textAlign: 'right'
    }
  }, how)))) : null), /*#__PURE__*/React.createElement(StepFooter, {
    back: "Draft",
    onBack: onBack
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary"
  }, "Restart from step 4"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "download",
    size: 14
  }), "Export markdown")));
}
Object.assign(window, {
  ResultStep
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/auteur-web/ResultStep.jsx", error: String((e && e.message) || e) }); }

// ui_kits/auteur-web/Shell.jsx
try { (() => {
const {
  WizardRail,
  Icon,
  Badge,
  Button,
  ThemeToggle
} = window.AuteurDesignSystem_11e1bd;
function Mark({
  size = 44
}) {
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      fontFamily: 'var(--font-script)',
      fontSize: size,
      lineHeight: 0.78,
      color: 'var(--text-strong)',
      flex: '0 0 auto'
    }
  }, "A");
}
function AppShell({
  steps,
  current,
  onStep,
  session,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: '100%',
      minHeight: 0,
      background: 'var(--surface-app)'
    }
  }, /*#__PURE__*/React.createElement(WizardRail, {
    steps: steps,
    current: current,
    onStep: onStep,
    header: /*#__PURE__*/React.createElement(Wordmark, null),
    footer: /*#__PURE__*/React.createElement(SessionFooter, {
      session: session
    })
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column'
    }
  }, children));
}
function Wordmark({
  size = 'var(--text-xl)'
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'baseline',
      lineHeight: 1,
      color: 'var(--text-strong)'
    }
  }, /*#__PURE__*/React.createElement(Mark, {
    size: 44
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-serif)',
      fontSize: size,
      lineHeight: 1,
      letterSpacing: 'var(--tracking-snug)',
      marginLeft: -1
    }
  }, "uteur")), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-caps)',
      color: 'var(--text-faint)'
    }
  }, "style from evidence"));
}
function SessionFooter({
  session = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)',
      borderTop: '1px solid var(--border-hairline)',
      paddingTop: 'var(--space-3)'
    }
  }, /*#__PURE__*/React.createElement(Row, {
    label: "session",
    value: session.id || 'local-4f2a'
  }), /*#__PURE__*/React.createElement(Row, {
    label: "spend",
    value: session.spend || '$0.00'
  }), /*#__PURE__*/React.createElement(Row, {
    label: "router",
    value: "ramp"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-2)',
      paddingTop: 'var(--space-1)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-faint)'
    }
  }, "theme"), ThemeToggle ? /*#__PURE__*/React.createElement(ThemeToggle, {
    size: "sm"
  }) : null));
}
function Row({
  label,
  value
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      color: 'var(--text-faint)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-data)',
      fontSize: 'var(--text-2xs)',
      color: 'var(--text-muted)',
      whiteSpace: 'nowrap'
    }
  }, value));
}
function StepHeader({
  index,
  title,
  blurb,
  aside
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      borderBottom: '1px solid var(--border-hairline)',
      padding: 'var(--space-8) var(--gutter-screen) var(--space-6)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 'var(--space-8)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-caps)',
      color: 'var(--text-faint)'
    }
  }, "Step ", index, " of 7"), /*#__PURE__*/React.createElement("h1", {
    style: {
      font: 'var(--type-title)'
    }
  }, title), blurb ? /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-body)',
      color: 'var(--text-muted)',
      maxWidth: 'var(--measure-ui)'
    }
  }, blurb) : null), aside);
}
function StepBody({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      overflow: 'auto',
      padding: 'var(--space-8) var(--gutter-screen)',
      ...style
    }
  }, children);
}
function StepFooter({
  back,
  onBack,
  children
}) {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      height: 'var(--space-16)',
      flex: '0 0 auto',
      borderTop: '1px solid var(--border-hairline)',
      background: 'var(--surface-panel)',
      padding: '0 var(--gutter-screen)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3)'
    }
  }, back ? /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    onClick: onBack
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-left",
    size: 14
  }), back) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), children);
}
function SectionLabel({
  children,
  action
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-4)',
      borderBottom: '1px solid var(--border-hairline)',
      paddingBottom: 'var(--space-2)',
      marginBottom: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-eyebrow)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-caps)',
      color: 'var(--text-faint)'
    }
  }, children), action);
}
Object.assign(window, {
  AppShell,
  Wordmark,
  Mark,
  StepHeader,
  StepBody,
  StepFooter,
  SectionLabel
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/auteur-web/Shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/auteur-web/data.js
try { (() => {
window.AUTEUR_DATA = {
  steps: [{
    id: 'idea',
    label: 'Idea'
  }, {
    id: 'author',
    label: 'Author'
  }, {
    id: 'research',
    label: 'Research'
  }, {
    id: 'clarify',
    label: 'Questions'
  }, {
    id: 'outline',
    label: 'Outline'
  }, {
    id: 'draft',
    label: 'Draft'
  }, {
    id: 'result',
    label: 'Result'
  }],
  lengths: [{
    value: 'flash',
    label: 'Flash — ~1k words',
    strategy: 'single-call'
  }, {
    value: 'short',
    label: 'Short — ~4k words',
    strategy: 'single-call'
  }, {
    value: 'long',
    label: 'Long — ~12k words',
    strategy: 'sequential-scene'
  }, {
    value: 'novelette',
    label: 'Novelette — ~20k words',
    strategy: 'sequential-scene'
  }],
  authors: [{
    id: 'borges',
    name: 'Jorge Luis Borges',
    dates: '1899–1986',
    provenance: 'full-text',
    works: 12,
    words: '412,000',
    note: 'Ficciones, El Aleph, Labyrinths'
  }, {
    id: 'chekhov',
    name: 'Anton Chekhov',
    dates: '1860–1904',
    provenance: 'full-text',
    works: 41,
    words: '1,140,000',
    note: 'Constance Garnett translations'
  }, {
    id: 'woolf',
    name: 'Virginia Woolf',
    dates: '1882–1941',
    provenance: 'full-text',
    works: 9,
    words: '806,000',
    note: 'Mrs Dalloway, The Waves, essays'
  }, {
    id: 'wharton',
    name: 'Edith Wharton',
    dates: '1862–1937',
    provenance: 'full-text',
    works: 22,
    words: '1,980,000',
    note: 'Novels and short fiction'
  }, {
    id: 'calvino',
    name: 'Italo Calvino',
    dates: '1923–1985',
    provenance: 'secondary',
    works: 0,
    words: '—',
    note: 'In copyright — interviews and criticism only'
  }],
  research: [{
    stage: 'corpus-select',
    tier: 'cheap',
    elapsed: '1.9s',
    detail: ['gutendex: 12 works matched', 'sampling across career period, 1935–1975', '31 passages selected, 18,400 words']
  }, {
    stage: 'prosody-compute',
    tier: null,
    elapsed: '0.4s',
    detail: ['412,118 words measured deterministically', 'no model involved']
  }, {
    stage: 'style-extract',
    tier: 'balanced',
    elapsed: '11.2s',
    detail: ['reading Ficciones — The Library of Babel', 'reading El Aleph — The Immortal', 'voice, diction, structure, imagery extracted', '14 exemplars cited']
  }],
  prosody: [{
    label: 'Mean sentence length',
    value: 24.6,
    unit: ' w',
    band: [6, 52],
    target: 24.6
  }, {
    label: 'Median sentence length',
    value: 21.0,
    unit: ' w',
    band: [6, 52],
    target: 21.0
  }, {
    label: 'Paragraph length',
    value: 112,
    unit: ' w',
    band: [20, 260],
    target: 112
  }, {
    label: 'Semicolon',
    value: 6.4,
    unit: '/1k',
    band: [0, 14],
    target: 6.4
  }, {
    label: 'Em dash',
    value: 3.1,
    unit: '/1k',
    band: [0, 14],
    target: 3.1
  }, {
    label: 'Colon',
    value: 2.8,
    unit: '/1k',
    band: [0, 14],
    target: 2.8
  }, {
    label: 'Dialogue ratio',
    value: 0.08,
    band: [0, 1],
    target: 0.08
  }, {
    label: 'Type-token ratio',
    value: 0.47,
    band: [0, 1],
    target: 0.47
  }, {
    label: 'Latinate ratio',
    value: 0.39,
    band: [0, 1],
    target: 0.39
  }],
  card: {
    author: 'Jorge Luis Borges',
    version: 'v3',
    confidence: 0.91,
    provenance: 'full-text',
    voice: [['pov', 'first person, scholarly', 'derived', 'The Library of Babel'], ['tense', 'past, with present-tense digression', 'derived', 'Tlön, Uqbar, Orbis Tertius'], ['narratorDistance', 'ironic remove', 'derived', 'Ficciones'], ['freeIndirect', 'rare', 'derived', null], ['reliability', 'erudite, quietly unreliable', 'derived', 'The Immortal']],
    diction: [['register', 'formal, essayistic', 'derived', null], ['concreteness', 'low — abstraction over sensory detail', 'derived', null]],
    lexicon: ['labyrinth', 'mirror', 'infinite', 'hexagonal', 'apocryphal', 'vindication', 'atrocious', 'inconceivable'],
    avoided: ['sentimental interiority', 'domestic realism', 'contemporary slang'],
    structure: [['openingMoves', 'attribution of a source that does not exist', 'derived', 'Tlön, Uqbar, Orbis Tertius'], ['closingMoves', 'a footnote that reframes the whole', 'derived', 'Pierre Menard'], ['sceneVsSummary', 'summary-dominant, ~9:1', 'measured', null]],
    antiPatterns: ['Never writes an action scene in real time.', 'Never lets a character have an ordinary conversation for its own sake.', 'Never resolves a mystery by explanation.']
  },
  exemplars: [{
    text: 'The universe (which others call the Library) is composed of an indefinite, perhaps infinite number of hexagonal galleries.',
    work: 'The Library of Babel',
    year: 1941,
    demonstrates: 'parenthetical correction as authority'
  }, {
    text: 'I owe the discovery of Uqbar to the conjunction of a mirror and an encyclopedia.',
    work: 'Tlön, Uqbar, Orbis Tertius',
    year: 1940,
    demonstrates: 'opening as attributed provenance'
  }, {
    text: 'He did not want to compose another Quixote — which is easy — but the Quixote itself.',
    work: 'Pierre Menard, Author of the Quixote',
    year: 1939,
    demonstrates: 'em-dash aside carrying the argument'
  }],
  questions: [{
    id: 'q1',
    round: 1,
    text: 'Should the story present itself as a review of a book that does not exist?',
    why: 'The corpus opens in this frame in 6 of 12 works; the idea does not specify a frame.',
    suggestions: ['Yes — a review of an apocryphal edition', 'No — a first-person account', 'A footnoted translation'],
    answer: 'Yes — a review of an apocryphal edition'
  }, {
    id: 'q2',
    round: 1,
    text: 'Who is the narrator, relative to the lighthouse?',
    why: 'The measured POV is first-person scholarly, which requires the narrator to have read about the events, not lived them.',
    suggestions: ['A cataloguer of the keeper\'s logs', 'The keeper\'s successor', 'An unnamed contemporary'],
    answer: 'A cataloguer of the keeper\'s logs'
  }, {
    id: 'q3',
    round: 2,
    text: 'Does the log\'s authorship stay unresolved?',
    why: 'antiPatterns: never resolves a mystery by explanation. Your answer to q1 makes the frame explanatory, so this decision is now open.',
    suggestions: ['Unresolved — the review declines to say', 'A footnote implies the keeper', 'Resolved in the final line'],
    answer: null
  }],
  outline: `## Beat sheet — "A Review of the Eddystone Log, 1893–1924"\n\n1. The reviewer establishes the edition: a 1924 privately printed transcription, 340 pages, of which pages 1–288 are in the keeper's hand.\n2. A digression on the keeper's biography, drawn from a source the reviewer admits he cannot locate.\n3. The reviewer notes that the entries after March 1924 continue in a hand *resembling* the keeper's, and that the resemblance is the interesting part.\n4. A comparison of two entries, printed side by side, dated eleven years apart and identical in wording.\n5. The reviewer proposes three explanations and dismisses the first two.\n6. A footnote, longer than the paragraph it annotates, on the practice of copying one's own logs to pass the winter.\n7. The review ends by recommending the edition to bibliographers.`,
  draft: `## A Review of the Eddystone Log, 1893–1924\n\nThe edition before me, privately printed at Plymouth in 1924 and bound in a green cloth that has not survived the century well, runs to three hundred and forty pages, of which the first two hundred and eighty-eight are indisputably in the hand of Elias Warde, keeper of the Eddystone light from 1893 until his death, and the remainder are not.\n\nI say indisputably; I mean that no one has disputed it. The distinction will become material.\n\nWarde's entries are of a monotony that only a bibliographer could love, and I confess I love them. The lamp turned. The weather was recorded in six words. A ship passed, or did not pass. It is in the nature of such a document that the reader begins, after some sixty pages, to attend not to the events but to the intervals between them — and it is in the intervals that the edition's editor, a Mr. Pengelly of whom I can discover nothing, has done his silent work.`,
  fit: [{
    label: 'Mean sentence length',
    value: 31.2,
    unit: ' w',
    band: [6, 52],
    target: 24.6,
    status: 'drift'
  }, {
    label: 'Semicolon',
    value: 5.9,
    unit: '/1k',
    band: [0, 14],
    target: 6.4,
    status: 'pass'
  }, {
    label: 'Em dash',
    value: 3.4,
    unit: '/1k',
    band: [0, 14],
    target: 3.1,
    status: 'pass'
  }, {
    label: 'Dialogue ratio',
    value: 0.0,
    band: [0, 1],
    target: 0.08,
    status: 'pass'
  }, {
    label: 'Type-token ratio',
    value: 0.51,
    band: [0, 1],
    target: 0.47,
    status: 'pass'
  }, {
    label: 'Latinate ratio',
    value: 0.42,
    band: [0, 1],
    target: 0.39,
    status: 'pass'
  }],
  findings: [{
    status: 'drift',
    text: 'Mean sentence length is 31.2 words against a corpus median of 21.0 with p90 at 44 — you have the ceiling but not the floor. The corpus alternates long periodic sentences with sentences under eight words; the draft has three such sentences in 940.'
  }, {
    status: 'pass',
    text: 'Punctuation rates, dialogue ratio and lexical density all fall inside the corpus interquartile band.'
  }, {
    status: 'pass',
    text: 'Opening move matches `structure.openingMoves`: attribution of a source that does not exist.'
  }],
  decisions: [['Frame', 'Review of an apocryphal edition', 'answered'], ['Narrator', 'A cataloguer of the keeper\'s logs', 'answered'], ['Log authorship', 'Left unresolved', 'model chose — question skipped'], ['Setting year', '1924', 'model chose — not asked']]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/auteur-web/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.CardHeader = __ds_scope.CardHeader;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.ProsodyStat = __ds_scope.ProsodyStat;

__ds_ns.ProvenanceMark = __ds_scope.ProvenanceMark;

__ds_ns.Thinking = __ds_scope.Thinking;

__ds_ns.WizardRail = __ds_scope.WizardRail;

__ds_ns.Exemplar = __ds_scope.Exemplar;

__ds_ns.Markdown = __ds_scope.Markdown;

__ds_ns.ThemeToggle = __ds_scope.ThemeToggle;

})();
