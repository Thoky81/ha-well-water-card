/**
 * Well Water Level Card  — v9
 * ──────────────────────────────────────────────────────────────────────────────
 * INSTALLATION (manual)
 *  1. Copy to /config/www/well-water-card.js
 *  2. Settings → Dashboards → Resources → Add
 *     URL: /local/well-water-card.js?v=9   ← version param busts the cache
 *     Type: JavaScript module
 *  3. Hard-refresh the browser (Ctrl + Shift + R)
 *
 * INSTALLATION (HACS custom repo)
 *  1. HACS → three-dot menu → Custom repositories
 *  2. URL: <your github repo URL>   Category: Lovelace
 *  3. Install → restart → add the resource (HACS can do this automatically)
 *
 * ── YAML reference ────────────────────────────────────────────────────────────
 *
 * SINGLE:
 *   type: custom:well-water-card
 *   entity: sensor.well_water_level
 *   name: Well
 *   sensor_unit: cm         # m | cm | mm | m3 | l  (what the sensor reports)
 *   display_unit: m         # m | cm | mm | m3 | l  (auto-converts)
 *   min: 0                  # empty threshold, in display_unit
 *   max: 4                  # full threshold, in display_unit
 *   warn_low: 1.0           # amber warning, in display_unit
 *   entity_pump: binary_sensor.well_pump
 *   theme: dark             # dark | light | ha | custom
 *   well_style: dark        # dark | light  (SVG shaft look, default = follows theme)
 *   well_position: left     # left | right | top | bottom
 *   font_size: normal       # small | normal | large
 *   show_title: true        # false hides the card title
 *   color: "#1e88e5"        # water tint for the "ok" state (warn/empty/full still win)
 *   # custom theme colors (only when theme: custom):
 *   card_background: "#0d1b2a"
 *   card_border: "#1a2d42"
 *   text_color: "#c8d8e8"
 *   title_color: "#4a7fa5"
 *
 * DUAL:
 *   type: custom:well-water-card
 *   layout: dual
 *   name: Water Tanks
 *   theme: ha
 *   well_style: dark
 *   dual_arrangement: side_by_side   # side_by_side | stacked
 *   font_size: normal                # small | normal | large
 *   show_title: true                 # false hides the card title
 *   wells:
 *     - entity: sensor.well_1
 *       name: Well
 *       sensor_unit: m
 *       display_unit: m
 *       min: 0
 *       max: 4
 *       warn_low: 1.0
 *       entity_pump: binary_sensor.pump_1
 *       color: "#1e88e5"             # per-well water tint for "ok" state
 *     - entity: sensor.tank_1
 *       name: Tank
 *       sensor_unit: l
 *       display_unit: l
 *       min: 0
 *       max: 2000
 *       warn_low: 400
 *       color: "#26a69a"
 */

// ─────────────────────────────────────────────────────────────────────────────
// Unit system
// ─────────────────────────────────────────────────────────────────────────────

const UNITS = {
  m:  { label: "m",   type: "depth",  dec: 2, toBase: v => v,        fromBase: v => v        },
  cm: { label: "cm",  type: "depth",  dec: 0, toBase: v => v / 100,  fromBase: v => v * 100  },
  mm: { label: "mm",  type: "depth",  dec: 0, toBase: v => v / 1000, fromBase: v => v * 1000 },
  m3: { label: "m³",  type: "volume", dec: 3, toBase: v => v,        fromBase: v => v        },
  l:  { label: "l",   type: "volume", dec: 0, toBase: v => v / 1000, fromBase: v => v * 1000 },
};

const UNIT_KEYS = Object.keys(UNITS);

function uConvert(v, from, to) {
  if (from === to) return v;
  const F = UNITS[from], T = UNITS[to];
  if (!F || !T || F.type !== T.type) return v;
  return T.fromBase(F.toBase(v));
}

function uFmt(v, k) {
  return v.toFixed((UNITS[k] || UNITS.m).dec);
}

function uLabel(k) {
  return (UNITS[k] || { label: k }).label;
}

function uIsVol(k) {
  return !!(UNITS[k] && UNITS[k].type === "volume");
}

function uCompat(k) {
  const type = UNITS[k] && UNITS[k].type;
  return type ? UNIT_KEYS.filter(x => UNITS[x].type === type) : UNIT_KEYS;
}

// Map a HA entity's unit_of_measurement attribute to one of our internal keys.
// Returns null for units we don't support (e.g. "%", "gal"), so callers can
// fall back to "m" or surface a hint.
function uFromHA(s) {
  if (!s) return null;
  const n = String(s).trim().toLowerCase();
  if (n === "m")  return "m";
  if (n === "cm") return "cm";
  if (n === "mm") return "mm";
  if (n === "m³" || n === "m3") return "m3";
  if (n === "l" || n === "liter" || n === "liters" || n === "litre" || n === "litres") return "l";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Colour palettes
// ─────────────────────────────────────────────────────────────────────────────

const WATER_PAL = {
  ok:   { main: "#1e88e5", light: "#42a5f5", glow: "rgba(30,136,229,0.30)"  },
  warn: { main: "#f59e0b", light: "#fbbf24", glow: "rgba(245,158,11,0.27)"  },
  low:  { main: "#e53935", light: "#ef5350", glow: "rgba(229,57,53,0.32)"   },
  full: { main: "#26a69a", light: "#4db6ac", glow: "rgba(38,166,154,0.30)"  },
};

// Derive a {main, light, glow} palette from a user-picked hex color so the
// custom "ok"-state color has the same lighter-highlight and soft-glow look
// as the built-in palettes. Invalid hex → null (caller falls back to WATER_PAL.ok).
function palFromMain(hex) {
  if (!hex) return null;
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  const lighten = c => Math.min(255, Math.round(c + (255 - c) * 0.28));
  const toHex   = v => v.toString(16).padStart(2, "0");
  return {
    main:  "#" + toHex(r) + toHex(g) + toHex(b),
    light: "#" + toHex(lighten(r)) + toHex(lighten(g)) + toHex(lighten(b)),
    glow:  "rgba(" + r + "," + g + "," + b + ",0.30)",
  };
}

// Card theme definitions
const CARD_THEMES = {
  dark: {
    cardBg:     "#0d1b2a",
    cardBorder: "1px solid #1a2d42",
    glow:       "radial-gradient(ellipse at 50% 0%, rgba(30,136,229,0.07) 0%, transparent 70%)",
    textBody:   "#c8d8e8",
    textSub:    "#4a7fa5",
    textMuted:  "#3d6280",
    titleColor: "#4a7fa5",
    divider:    "#1a2d42",
    barBg:      "#0d1f30",
    wellStyle:  "dark",
  },
  light: {
    cardBg:     "#f0f7ff",
    cardBorder: "1px solid #c5d8ea",
    glow:       "radial-gradient(ellipse at 50% 0%, rgba(30,136,229,0.05) 0%, transparent 60%)",
    textBody:   "#1a2d42",
    textSub:    "#3d7296",
    textMuted:  "#6a9bc0",
    titleColor: "#2a6090",
    divider:    "#c5d8ea",
    barBg:      "#d8ebf5",
    wellStyle:  "light",
  },
  ha: {
    cardBg:     "var(--card-background-color, #fff)",
    cardBorder: "none",
    glow:       "none",
    textBody:   "var(--primary-text-color, #212121)",
    textSub:    "var(--secondary-text-color, #727272)",
    textMuted:  "var(--disabled-text-color, #9e9e9e)",
    titleColor: "var(--primary-color, #1e88e5)",
    divider:    "var(--divider-color, #e0e0e0)",
    barBg:      "var(--secondary-background-color, #f5f5f5)",
    wellStyle:  "dark",
  },
};

// SVG shaft palette (independent of card theme)
const SHAFT_PAL = {
  dark: {
    wallL:   ["#1a3a55", "#0d1b2a", "#162940"],
    wallR:   "#162940",
    cap:     "#1a2f45",
    capRim:  "#1e3a54",
    bottom:  "#0a1520",
    tick:    "#1e3a55",
    tickTxt: "#2a4f6e",
    pipe:    "#1a2f45",
    pipeRim: "#1e3a54",
    inner:   "rgba(255,255,255,0.04)",
  },
  light: {
    wallL:   ["#b0cede", "#d4ecf7", "#c0dced"],
    wallR:   "#a8c6d8",
    cap:     "#a0c0d4",
    capRim:  "#90b0c4",
    bottom:  "#88a8bc",
    tick:    "#90b8d0",
    tickTxt: "#5888a0",
    pipe:    "#a0c0d4",
    pipeRim: "#90b0c4",
    inner:   "rgba(255,255,255,0.18)",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

function defaultWell(n) {
  return {
    name:         n === 0 ? "Well 1" : "Well 2",
    sensor_unit:  "m",
    display_unit: "m",
    min:          0,
    max:          4,
    warn_low:     null,
    color:        null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Card element
// ─────────────────────────────────────────────────────────────────────────────

class WellWaterCard extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config  = null;
    this._hass    = null;
    this._animId  = null;
    this._wave    = 0;
    this._pending = false;
  }

  // ── HA lifecycle ────────────────────────────────────────────────────────────

  setConfig(config) {
    // Do NOT throw here — the visual editor calls setConfig on every field
    // change, and a throw freezes the preview (which is the symptom users see
    // as "my edits aren't reflecting"). Missing-entity is handled in _render
    // with a friendly placeholder instead.
    if (config.layout === "dual") {
      const w = config.wells || [];
      this._config = {
        layout:           "dual",
        name:             config.name            || "Water Tanks",
        theme:            config.theme           || "dark",
        well_style:       config.well_style      || null,
        dual_arrangement: config.dual_arrangement || "side_by_side",
        font_size:        config.font_size       || "normal",
        show_title:       config.show_title !== false,
        card_background:  config.card_background  || null,
        card_border:      config.card_border      || null,
        text_color:       config.text_color       || null,
        title_color:      config.title_color      || null,
        wells: [
          Object.assign({}, defaultWell(0), w[0] || {}),
          Object.assign({}, defaultWell(1), w[1] || {}),
        ],
      };
    } else {
      const su = config.sensor_unit  || "m";
      const du = config.display_unit || su;
      this._config = Object.assign({
        layout:          "single",
        name:            "Well",
        sensor_unit:     su,
        display_unit:    du,
        min:             0,
        max:             uIsVol(du) ? 1000 : 4,
        warn_low:        null,
        color:           null,
        theme:           "dark",
        well_style:      null,
        well_position:   "left",
        font_size:       "normal",
        show_title:      true,
        card_background: null,
        card_border:     null,
        text_color:      null,
        title_color:     null,
      }, config);
    }
    this._queue();
  }

  set hass(hass) {
    this._hass = hass;
    this._queue();
  }

  connectedCallback()    { this._startAnim(); }
  disconnectedCallback() { cancelAnimationFrame(this._animId); }

  // ── Internal ────────────────────────────────────────────────────────────────

  _queue() {
    if (!this._pending) {
      this._pending = true;
      requestAnimationFrame(() => { this._pending = false; this._render(); });
    }
  }

  _startAnim() {
    const tick = () => {
      this._wave = (this._wave + 0.38) % 360;
      const d1 = this._wavePath(this._wave,      0);
      const d2 = this._wavePath(this._wave + 90, 1);
      this.shadowRoot.querySelectorAll(".wp1").forEach(e => e.setAttribute("d", d1));
      this.shadowRoot.querySelectorAll(".wp2").forEach(e => e.setAttribute("d", d2));
      this._animId = requestAnimationFrame(tick);
    };
    this._animId = requestAnimationFrame(tick);
  }

  _wavePath(offset, variant) {
    const rad  = offset * Math.PI / 180;
    const amp  = variant === 0 ? 5    : 3.5;
    const freq = variant === 0 ? 1.2  : 0.9;
    const W    = 240;
    let d = "M0,12";
    for (let x = 0; x <= W; x += 4) {
      d += " L" + x + "," + (12 + Math.sin(x / W * Math.PI * 2 * freq + rad) * amp).toFixed(2);
    }
    return d + " L" + W + ",80 L0,80 Z";
  }

  _fontScale() {
    const s = this._config && this._config.font_size;
    return s === "small" ? 0.85 : s === "large" ? 1.2 : 1.0;
  }

  _getTheme() {
    const c = this._config;
    const base = CARD_THEMES[c.theme] || CARD_THEMES.dark;
    const t = Object.assign({}, base);
    if (c.card_background) t.cardBg     = c.card_background;
    if (c.card_border)     t.cardBorder = "1px solid " + c.card_border;
    if (c.text_color)      t.textBody   = c.text_color;
    if (c.title_color)     t.titleColor = c.title_color;
    const wsKey = c.well_style || t.wellStyle || "dark";
    t.shaft = SHAFT_PAL[wsKey] || SHAFT_PAL.dark;
    return t;
  }

  _resolve(wcfg) {
    // sensor_unit precedence: explicit config > entity's unit_of_measurement > "m"
    let su = wcfg.sensor_unit;
    if (!su && this._hass && wcfg.entity) {
      const st = this._hass.states[wcfg.entity];
      if (st) su = uFromHA(st.attributes && st.attributes.unit_of_measurement);
    }
    su = su || "m";
    const du  = wcfg.display_unit || su;
    const min = wcfg.min  != null ? +wcfg.min  : 0;
    const max = wcfg.max  != null ? +wcfg.max  : (uIsVol(du) ? 1000 : 4);
    const warn = wcfg.warn_low != null ? +wcfg.warn_low : null;

    let level = null;
    if (this._hass && wcfg.entity) {
      const s = this._hass.states[wcfg.entity];
      if (s) {
        const v = parseFloat(s.state);
        if (!isNaN(v)) level = uConvert(v, su, du);
      }
    }

    let pumpOn = null;
    if (this._hass && wcfg.entity_pump) {
      const s = this._hass.states[wcfg.entity_pump];
      if (s) pumpOn = s.state === "on";
    }

    const pct     = level !== null ? Math.max(0, Math.min(100, (level - min) / (max - min) * 100)) : 0;
    const isEmpty = level !== null && pct < 5;
    const isWarn  = warn !== null  && level !== null && level < warn;
    const isFull  = level !== null && pct > 90;
    // Status colors (warn/empty/full) still win over a user-picked color, so the
    // alert at-a-glance behavior is preserved. Custom `color` only tints the
    // default "ok" state.
    const okPal   = palFromMain(wcfg.color) || WATER_PAL.ok;
    const pal     = isEmpty ? WATER_PAL.low : isWarn ? WATER_PAL.warn : isFull ? WATER_PAL.full : okPal;

    return {
      level, pct, min, max, pumpOn,
      unit:   du,
      suUnit: su,
      col:    pal.main,
      colL:   pal.light,
      glow:   pal.glow,
      name:   wcfg.name || "Well",
      status: isEmpty ? "EMPTY" : isWarn ? "LOW" : isFull ? "FULL" : "OK",
      lbl:    uIsVol(du) ? "Volume" : "Level",
      isEmpty, isWarn, isFull,
    };
  }

  // ── SVG builders ────────────────────────────────────────────────────────────

  _svgLarge(d, shaft) {
    const { level, pct, min, max, unit, col, colL } = d;
    const SH = 200, SB = 230;
    const fillH = pct / 100 * SH;
    const fillY = SB - fillH;

    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
      y: SB - f * SH,
      v: uFmt(min + (max - min) * f, unit),
    }));

    const ticksSvg = ticks.map(t =>
      "<line x1='16' y1='" + t.y + "' x2='25' y2='" + t.y + "' stroke='" + shaft.tick + "' stroke-width='1'/>" +
      "<text x='14' y='" + (t.y + 3) + "' text-anchor='end' font-size='7' fill='" + shaft.tickTxt + "' font-family='monospace'>" + t.v + "</text>"
    ).join("");

    const levelLine = level !== null
      ? "<line x1='26' y1='" + fillY + "' x2='74' y2='" + fillY + "' stroke='" + col + "' stroke-width='1.5' opacity='.9' filter='url(#_gl)'/>" +
        "<polygon points='78," + fillY + " 83," + (fillY-4) + " 83," + (fillY+4) + "' fill='" + col + "' opacity='.9'/>"
      : "";

    const levelLabel = (level !== null && fillH > 20)
      ? "<text x='88' y='" + (fillY + 4) + "' font-size='8' fill='" + col + "' font-family='monospace' opacity='.85'>" + uFmt(level, unit) + "</text>"
      : "";

    return (
      "<svg width='100' height='260' viewBox='0 0 100 260'>" +
      "<defs>" +
        "<clipPath id='_sc'><rect x='26' y='30' width='48' height='200' rx='2'/></clipPath>" +
        "<linearGradient id='_wg' x1='0' y1='0' x2='0' y2='1'>" +
          "<stop offset='0%' stop-color='" + colL + "' stop-opacity='.9'/>" +
          "<stop offset='100%' stop-color='" + col + "' stop-opacity='1'/>" +
        "</linearGradient>" +
        "<linearGradient id='_sg' x1='0' y1='0' x2='1' y2='0'>" +
          "<stop offset='0%' stop-color='" + shaft.wallL[0] + "'/>" +
          "<stop offset='40%' stop-color='" + shaft.wallL[1] + "'/>" +
          "<stop offset='100%' stop-color='" + shaft.wallL[2] + "'/>" +
        "</linearGradient>" +
        "<filter id='_gl'><feGaussianBlur stdDeviation='3' result='b'/><feMerge><feMergeNode in='b'/><feMergeNode in='SourceGraphic'/></feMerge></filter>" +
      "</defs>" +
      ticksSvg +
      "<text x='7' y='135' text-anchor='middle' font-size='7' fill='" + shaft.tick + "' font-family='monospace' transform='rotate(-90 7 135)'>" + uLabel(unit) + "</text>" +
      "<rect x='26' y='30'  width='6'  height='200' fill='url(#_sg)' rx='2'/>" +
      "<rect x='68' y='30'  width='6'  height='200' fill='" + shaft.wallR + "' rx='2'/>" +
      "<rect x='20' y='22'  width='60' height='10'  fill='" + shaft.cap    + "' rx='3'/>" +
      "<rect x='22' y='20'  width='56' height='4'   fill='" + shaft.capRim + "' rx='2'/>" +
      "<rect x='26' y='228' width='48' height='4'   fill='" + shaft.bottom + "' rx='1'/>" +
      "<g clip-path='url(#_sc)'>" +
        "<rect x='26' y='" + fillY + "' width='48' height='" + (fillH + 20) + "' fill='url(#_wg)' opacity='.85'/>" +
        "<g transform='translate(26," + (fillY - 12) + ") scale(" + (48/240).toFixed(5) + ",1)'>" +
          "<path class='wp1' d='" + this._wavePath(this._wave,      0) + "' fill='" + colL + "' opacity='.38'/>" +
          "<path class='wp2' d='" + this._wavePath(this._wave + 90, 1) + "' fill='" + col  + "' opacity='.32'/>" +
        "</g>" +
      "</g>" +
      "<rect x='26' y='30' width='2' height='200' fill='" + shaft.inner + "'/>" +
      levelLine +
      levelLabel +
      "<rect x='42' y='8'  width='16' height='15' fill='" + shaft.pipe    + "' rx='2'/>" +
      "<rect x='44' y='6'  width='12' height='4'  fill='" + shaft.pipeRim + "' rx='1'/>" +
      "</svg>"
    );
  }

  _svgSmall(d, idx, shaft) {
    const { level, pct, min, max, unit, col, colL } = d;
    const SX = 17, SW = 43, SY = 18, SH = 178, SB = SY + SH;
    const fillH = pct / 100 * SH;
    const fillY = SB - fillH;
    const I = "d" + idx;

    const ticks = [0, 0.5, 1].map(f => ({
      y: SB - f * SH,
      v: uFmt(min + (max - min) * f, unit),
    }));

    const ticksSvg = ticks.map(t =>
      "<line x1='5' y1='" + t.y + "' x2='" + (SX-1) + "' y2='" + t.y + "' stroke='" + shaft.tick + "' stroke-width='1'/>" +
      "<text x='4' y='" + (t.y + 3) + "' text-anchor='end' font-size='6.5' fill='" + shaft.tickTxt + "' font-family='monospace'>" + t.v + "</text>"
    ).join("");

    const levelLine = level !== null
      ? "<line x1='" + SX + "' y1='" + fillY + "' x2='" + (SX+SW) + "' y2='" + fillY + "' stroke='" + col + "' stroke-width='1.5' opacity='.9' filter='url(#" + I + "gl)'/>" +
        "<polygon points='" + (SX+SW+3) + "," + fillY + " " + (SX+SW+8) + "," + (fillY-3.5) + " " + (SX+SW+8) + "," + (fillY+3.5) + "' fill='" + col + "' opacity='.9'/>"
      : "";

    const levelLabel = (level !== null && fillH > 15)
      ? "<text x='" + (SX+SW+11) + "' y='" + (fillY+3.5) + "' font-size='7' fill='" + col + "' font-family='monospace' opacity='.85'>" + uFmt(level, unit) + "</text>"
      : "";

    const pipeX = SX + Math.floor(SW / 2);

    return (
      "<svg width='80' height='215' viewBox='0 0 80 215'>" +
      "<defs>" +
        "<clipPath id='" + I + "c'><rect x='" + SX + "' y='" + SY + "' width='" + SW + "' height='" + SH + "' rx='2'/></clipPath>" +
        "<linearGradient id='" + I + "wg' x1='0' y1='0' x2='0' y2='1'>" +
          "<stop offset='0%' stop-color='" + colL + "' stop-opacity='.9'/>" +
          "<stop offset='100%' stop-color='" + col + "' stop-opacity='1'/>" +
        "</linearGradient>" +
        "<linearGradient id='" + I + "sg' x1='0' y1='0' x2='1' y2='0'>" +
          "<stop offset='0%' stop-color='" + shaft.wallL[0] + "'/>" +
          "<stop offset='40%' stop-color='" + shaft.wallL[1] + "'/>" +
          "<stop offset='100%' stop-color='" + shaft.wallL[2] + "'/>" +
        "</linearGradient>" +
        "<filter id='" + I + "gl'><feGaussianBlur stdDeviation='2.5' result='b'/><feMerge><feMergeNode in='b'/><feMergeNode in='SourceGraphic'/></feMerge></filter>" +
      "</defs>" +
      ticksSvg +
      "<rect x='" + SX + "' y='" + SY + "' width='5' height='" + SH + "' fill='url(#" + I + "sg)' rx='2'/>" +
      "<rect x='" + (SX+SW-5) + "' y='" + SY + "' width='5' height='" + SH + "' fill='" + shaft.wallR + "' rx='2'/>" +
      "<rect x='" + (SX-4) + "' y='" + (SY-8) + "' width='" + (SW+8) + "' height='9' fill='" + shaft.cap + "' rx='2'/>" +
      "<rect x='" + (SX-2) + "' y='" + (SY-11) + "' width='" + (SW+4) + "' height='4' fill='" + shaft.capRim + "' rx='2'/>" +
      "<rect x='" + SX + "' y='" + (SB-2) + "' width='" + SW + "' height='4' fill='" + shaft.bottom + "' rx='1'/>" +
      "<g clip-path='url(#" + I + "c)'>" +
        "<rect x='" + SX + "' y='" + fillY + "' width='" + SW + "' height='" + (fillH + 10) + "' fill='url(#" + I + "wg)' opacity='.85'/>" +
        "<g transform='translate(" + SX + "," + (fillY-10) + ") scale(" + (SW/240).toFixed(5) + ",1)'>" +
          "<path class='wp1' d='" + this._wavePath(this._wave,      0) + "' fill='" + colL + "' opacity='.38'/>" +
          "<path class='wp2' d='" + this._wavePath(this._wave + 90, 1) + "' fill='" + col  + "' opacity='.32'/>" +
        "</g>" +
      "</g>" +
      "<rect x='" + SX + "' y='" + SY + "' width='2' height='" + SH + "' fill='" + shaft.inner + "'/>" +
      levelLine +
      levelLabel +
      "<rect x='" + (pipeX-6) + "' y='4' width='12' height='8' fill='" + shaft.pipe    + "' rx='2'/>" +
      "<rect x='" + (pipeX-4) + "' y='2' width='8'  height='4' fill='" + shaft.pipeRim + "' rx='1'/>" +
      "</svg>"
    );
  }

  // ── Shared CSS ───────────────────────────────────────────────────────────────

  _css(t) {
    return (
      ":host { display: block; font-family: 'JetBrains Mono', 'Courier New', monospace; }" +
      ".card { background: " + t.cardBg + "; border: " + t.cardBorder + "; border-radius: 16px; color: " + t.textBody + "; position: relative; overflow: hidden; }" +
      ".card::before { content: ''; position: absolute; inset: 0; background: " + t.glow + "; pointer-events: none; }" +
      ".divider { height: 1px; background: " + t.divider + "; margin: 11px 0; }" +
      ".bar-w { height: 4px; background: " + t.barBg + "; border-radius: 2px; overflow: hidden; }" +
      ".bar-f { height: 100%; border-radius: 2px; transition: width 0.8s cubic-bezier(0.4,0,0.2,1); }" +
      ".mi { display: flex; flex-direction: column; gap: 2px; }" +
      ".ml { font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; color: " + t.textMuted + "; }" +
      ".mv { font-size: 11px; color: " + t.textSub + "; }" +
      "@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }"
    );
  }

  // ── Readings block ───────────────────────────────────────────────────────────

  _readings(d, t, compact) {
    const { level, pct, unit, col, glow, pumpOn, lbl } = d;
    const ul   = uLabel(unit);
    const scale = this._fontScale();
    const fsBig   = Math.round((compact ? 22 : 32) * scale) + "px";
    const fsSmall = Math.round((compact ? 11 : 13) * scale) + "px";

    const pumpHtml = pumpOn !== null
      ? "<div class='mi'><div class='ml'>Pump</div><div class='mv'>" +
          "<span style='display:inline-block;width:6px;height:6px;border-radius:50%;" +
          "background:" + (pumpOn ? "#4caf50" : "#263d52") + ";" +
          "box-shadow:" + (pumpOn ? "0 0 6px rgba(76,175,80,0.7)" : "none") + ";" +
          "margin-right:3px;vertical-align:middle;" +
          (pumpOn ? "animation:pulse 1.2s ease-in-out infinite;" : "") + "'></span>" +
          (pumpOn ? "On" : "Off") +
        "</div></div>"
      : "";

    return (
      "<div style='font-size:" + (compact?"8px":"9px") + ";letter-spacing:.12em;text-transform:uppercase;color:" + t.textMuted + ";margin-bottom:2px;'>" + lbl + "</div>" +
      "<div style='font-size:" + fsBig + ";font-weight:700;color:" + col + ";line-height:1;letter-spacing:-.02em;text-shadow:0 0 20px " + glow + ";'>" +
        (level !== null ? uFmt(level, unit) : "—") +
        "<span style='font-size:" + fsSmall + ";color:" + t.textMuted + ";margin-left:2px;'>" + ul + "</span>" +
      "</div>" +
      "<div style='font-size:" + fsSmall + ";color:" + t.textSub + ";margin-top:" + (compact?"3px":"4px") + ";margin-bottom:" + (compact?"8px":"12px") + ";'>" +
        (level !== null ? Math.round(pct) + "% capacity" : "—") +
      "</div>" +
      "<div class='bar-w'><div class='bar-f' style='width:" + pct + "%;background:linear-gradient(90deg," + col + "88," + col + ");'></div></div>" +
      "<div class='divider'></div>" +
      "<div style='display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;'>" +
        "<div class='mi'><div class='ml'>Min</div><div class='mv'>" + uFmt(d.min, unit) + " " + ul + "</div></div>" +
        "<div class='mi'><div class='ml'>Max</div><div class='mv'>" + uFmt(d.max, unit) + " " + ul + "</div></div>" +
        pumpHtml +
      "</div>"
    );
  }

  // ── Badge helpers ────────────────────────────────────────────────────────────

  _badgeBg(d) {
    if (d.isEmpty) return "rgba(229,57,53,0.15)";
    if (d.isWarn)  return "rgba(245,158,11,0.15)";
    if (d.isFull)  return "rgba(38,166,154,0.14)";
    return "rgba(30,136,229,0.13)";
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  _render() {
    if (!this._config) return;
    try {
      if (this._configIncomplete()) { this._renderPlaceholder(); return; }
      if (this._config.layout === "dual") this._renderDual();
      else this._renderSingle();
    } catch (e) {
      console.error("[well-water-card] Render error:", e);
      this.shadowRoot.innerHTML = "<ha-card style='padding:16px;color:red;font-family:monospace;font-size:12px;'>[well-water-card] Render error: " + e.message + "</ha-card>";
    }
  }

  _configIncomplete() {
    const c = this._config;
    if (!c) return true;
    if (c.layout === "dual") {
      return !c.wells || !c.wells[0] || !c.wells[0].entity || !c.wells[1] || !c.wells[1].entity;
    }
    return !c.entity;
  }

  _renderPlaceholder() {
    const t = this._getTheme();
    this.shadowRoot.innerHTML =
      "<style>" + this._css(t) +
      ".card{padding:24px;}" +
      ".ph-title{font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:" + t.titleColor + ";margin-bottom:10px;}" +
      ".ph-body{font-size:13px;color:" + t.textSub + ";line-height:1.5;}" +
      ".ph-hint{font-size:11px;color:" + t.textMuted + ";margin-top:10px;}" +
      "</style>" +
      "<ha-card><div class='card'>" +
        "<div class='ph-title'>Well Water Level</div>" +
        "<div class='ph-body'>Pick a level sensor to start.</div>" +
        "<div class='ph-hint'>Open the visual editor and choose an entity, or set <code>entity:</code> in YAML.</div>" +
      "</div></ha-card>";
  }

  _renderSingle() {
    const c   = this._config;
    const t   = this._getTheme();
    const d   = this._resolve(c);
    const pos = c.well_position || "left";
    const showTitle = c.show_title !== false;

    const { col, status, name, unit, suUnit } = d;
    const scale = this._fontScale();
    const titleFs = Math.round(11 * scale);
    const badgeFs = Math.round(9 * scale);

    const suBadge = suUnit !== unit
      ? "<span style='font-size:" + Math.round(9 * scale) + "px;color:" + t.textMuted + ";margin-left:6px;'>sensor: " + uLabel(suUnit) + "</span>"
      : "";

    const isVertical = pos === "top" || pos === "bottom";
    const isReverse  = pos === "right" || pos === "bottom";

    const svgBlock =
      "<div class='svg-wrap' style='flex-shrink:0;" + (isVertical ? "display:flex;justify-content:center;" : "") + "'>" +
      this._svgLarge(d, t.shaft) +
      "</div>";

    const readBlock =
      "<div style='flex:1;min-width:0;" + (isVertical ? "" : "padding-top:8px;") + "'>" +
      this._readings(d, t, false) +
      "</div>";

    const bodyContent = isReverse ? readBlock + svgBlock : svgBlock + readBlock;

    // Header: optionally show the title; the status badge always renders.
    // When the title is hidden, the badge floats right on its own row.
    const header =
      "<div class='hdr'>" +
        (showTitle ? "<div class='htitle'>" + name + suBadge + "</div>" : "<div></div>") +
        "<div class='badge'>" + status + "</div>" +
      "</div>";

    this.shadowRoot.innerHTML =
      "<style>" + this._css(t) +
      ".card{padding:20px 24px 24px;container-type:inline-size;}" +
      ".hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:" + (showTitle ? 18 : 10) + "px;}" +
      ".htitle{font-size:" + titleFs + "px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:" + t.titleColor + ";}" +
      ".badge{font-size:" + badgeFs + "px;font-weight:700;letter-spacing:.15em;padding:3px 8px;border-radius:4px;color:" + col + ";border:1px solid " + col + "44;background:" + this._badgeBg(d) + ";}" +
      ".body{display:flex;flex-direction:" + (isVertical ? "column" : "row") + ";align-items:" + (isVertical ? "stretch" : "flex-start") + ";gap:" + (isVertical ? "14px" : "20px") + ";}" +
      // On narrow cards (e.g. phone sidebar, dense grid), collapse side-by-side
      // layouts to stacked so the SVG isn't squeezed into unreadable proportions.
      "@container (max-width: 320px){.body{flex-direction:column !important;align-items:stretch !important;gap:14px !important;}.svg-wrap{display:flex;justify-content:center;}}" +
      "</style>" +
      "<ha-card><div class='card'>" +
        header +
        "<div class='body'>" + bodyContent + "</div>" +
      "</div></ha-card>";
  }

  _renderDual() {
    const c       = this._config;
    const t       = this._getTheme();
    const d0      = this._resolve(c.wells[0]);
    const d1      = this._resolve(c.wells[1]);
    const stacked = c.dual_arrangement === "stacked";
    const showTitle = c.show_title !== false;
    const scale = this._fontScale();

    const wellTitleFs = Math.round(10 * scale);
    const wellBadgeFs = Math.round(8 * scale);

    const wellHtml = (d, idx) => {
      const { col, status, name } = d;

      // Stacked: full-width row with large SVG on left, readings on right
      // Side-by-side: compact column with small SVG + readings below
      const inner = stacked
        ? "<div style='display:flex;align-items:flex-start;gap:16px;'>" +
            "<div style='flex-shrink:0;'>" + this._svgLarge(d, t.shaft) + "</div>" +
            "<div style='flex:1;min-width:0;padding-top:8px;'>" + this._readings(d, t, false) + "</div>" +
          "</div>"
        : "<div style='display:flex;justify-content:center;'>" + this._svgSmall(d, idx, t.shaft) + "</div>" +
          "<div style='padding-top:8px;'>" + this._readings(d, t, true) + "</div>";

      // Stacked separator between wells
      const topBorder = stacked && idx === 1
        ? "border-top:1px solid " + t.divider + ";padding-top:14px;margin-top:14px;"
        : "";

      return (
        "<div style='" + topBorder + "'>" +
          "<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;'>" +
            "<div style='font-size:" + wellTitleFs + "px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:" + t.titleColor + ";'>" + name + "</div>" +
            "<div style='font-size:" + wellBadgeFs + "px;font-weight:700;letter-spacing:.1em;padding:2px 7px;border-radius:3px;color:" + col + ";border:1px solid " + col + "44;background:" + this._badgeBg(d) + ";'>" + status + "</div>" +
          "</div>" +
          inner +
        "</div>"
      );
    };

    // Side-by-side: two equal columns; stacked: single column
    const gridClass = stacked ? "grid stacked" : "grid sbs";

    this.shadowRoot.innerHTML =
      "<style>" + this._css(t) +
      ".card{padding:16px 18px 20px;container-type:inline-size;}" +
      ".chdr{display:flex;align-items:center;margin-bottom:14px;}" +
      ".ctitle{font-size:" + Math.round(11 * scale) + "px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:" + t.titleColor + ";}" +
      ".bar-w{height:3px;}" +
      ".ml{font-size:" + Math.round(7 * scale) + "px;} .mv{font-size:" + Math.round(10 * scale) + "px;}" +
      ".grid.sbs{display:grid;grid-template-columns:1fr 1fr;gap:0;}" +
      ".grid.stacked{display:flex;flex-direction:column;}" +
      ".grid.sbs .col0{border-right:1px solid " + t.divider + ";padding-right:14px;}" +
      ".grid.sbs .col1{padding-left:14px;}" +
      // Collapse side-by-side to stacked on narrow cards so neither well
      // gets crushed. Drop the column divider and horizontal padding too.
      "@container (max-width: 360px){.grid.sbs{display:flex;flex-direction:column;}.grid.sbs .col0,.grid.sbs .col1{border:none;padding:0;}.grid.sbs .col1{border-top:1px solid " + t.divider + ";padding-top:14px;margin-top:14px;}}" +
      "</style>" +
      "<ha-card><div class='card'>" +
        (showTitle ? "<div class='chdr'><div class='ctitle'>" + c.name + "</div></div>" : "") +
        "<div class='" + gridClass + "'>" +
          "<div class='col0'>" + wellHtml(d0, 0) + "</div>" +
          "<div class='col1'>" + wellHtml(d1, 1) + "</div>" +
        "</div>" +
      "</div></ha-card>";
  }

  // ── Card metadata ────────────────────────────────────────────────────────────

  getCardSize() {
    return this._config && this._config.layout === "dual" ? 5 : 4;
  }

  static getConfigElement() {
    return document.createElement("well-water-card-editor");
  }

  static getStubConfig() {
    return {
      layout:        "single",
      entity:        "",
      sensor_unit:   "m",
      display_unit:  "m",
      min:           0,
      max:           4,
      name:          "Well",
      warn_low:      1.0,
      theme:         "dark",
      well_position: "left",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual config editor
// ─────────────────────────────────────────────────────────────────────────────

class WellWaterCardEditor extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass   = null;
    this._built  = false;
  }

  // ── HA lifecycle ────────────────────────────────────────────────────────────

  setConfig(config) {
    // Always accept and rebuild — do NOT guard with JSON.stringify.
    // Root cause of "editor not working": after a field change fires
    // config-changed, HA calls setConfig back with the same object we
    // already stored, so stringify comparison matched and skipped the
    // rebuild. Layout / theme switches appeared to do nothing.
    this._config = Object.assign({}, config);
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    // Do NOT full-rebuild on every hass update — HA fires this every few
    // seconds on any state change and would destroy in-progress user input.
    // Just push the new hass to any entity pickers already in the DOM.
    this.shadowRoot.querySelectorAll("ha-entity-picker")
      .forEach(p => { p.hass = hass; });
    // If the DOM hasn't been built yet (hass arrived before setConfig), build now.
    if (!this._built) this._build();
  }

  // ── Core ────────────────────────────────────────────────────────────────────

  _fire(config) {
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config },
      bubbles: true,
      composed: true,
    }));
  }

  _build() {
    try {
      this._buildInner();
    } catch (e) {
      console.error("[well-water-card-editor] build error:", e);
    }
  }

  // ── DOM construction ────────────────────────────────────────────────────────

  _buildInner() {
    this._built = true;
    const c       = this._config;
    const layout  = c.layout  || "single";
    const theme   = c.theme   || "dark";
    const isCustom = theme === "custom";

    // Computed for single mode
    const su    = c.sensor_unit  || "m";
    const du    = c.display_unit || su;
    const compat = uCompat(su);
    const vol   = uIsVol(du);
    const step  = vol ? 10 : 0.1;

    // Defaults for dual wells
    const wells = [
      Object.assign({}, defaultWell(0), (c.wells || [])[0] || {}),
      Object.assign({}, defaultWell(1), (c.wells || [])[1] || {}),
    ];

    // ── option helpers (no selected attr — we set .value programmatically) ──
    const uOpts = keys => keys.map(k =>
      `<option value="${k}">${UNITS[k].label}</option>`).join("");
    const opt = (val, lbl) =>
      `<option value="${val}">${lbl}</option>`;

    // ── entity picker helper ─────────────────────────────────────────────────
    // ha-entity-picker is HA's built-in component — gives autocomplete,
    // search, friendly names. We set .hass and .value as JS properties
    // after insertion (HTML attributes can't set object properties).
    const picker = (dataField, label, domainHint) =>
      `<div class="picker-wrap full">
        <span class="picker-label">${label}</span>
        <ha-entity-picker
          data-field="${dataField}"
          ${domainHint ? 'data-domain="' + domainHint + '"' : ""}
          allow-custom-entity
        ></ha-entity-picker>
       </div>`;

    // ── well block (dual) ───────────────────────────────────────────────────
    const wellBlock = (w, idx) => {
      const wsu = w.sensor_unit  || "m";
      const wdu = w.display_unit || wsu;
      const wcompat = uCompat(wsu);
      const wvol = uIsVol(wdu);
      const wstep = wvol ? 10 : 0.1;
      const p = "w" + idx + "_";
      return `
        <div class="well-block">
          <div class="wb-title">${idx === 0 ? "💧" : "🪣"} Well ${idx + 1}</div>

          <label class="full"><span>Name</span>
            <input id="${p}name" type="text" placeholder="Well ${idx+1}"></label>

          ${picker(p + "entity",      "Level sensor *",       "")}
          ${picker(p + "entity_pump", "Pump (optional)",      "binary_sensor")}

          <label><span>Sensor unit</span>
            <select id="${p}sensor_unit">${uOpts(UNIT_KEYS)}</select></label>
          <label><span>Display unit</span>
            <select id="${p}display_unit">${uOpts(wcompat)}</select></label>
          ${wsu !== wdu ? `<div class="conv full">↳ ${uLabel(wsu)} → ${uLabel(wdu)}</div>` : ""}

          <label><span>Min (${uLabel(wdu)})</span>
            <input id="${p}min" type="number" step="${wstep}" placeholder="0"></label>
          <label><span>Max (${uLabel(wdu)})</span>
            <input id="${p}max" type="number" step="${wstep}" placeholder="${wvol?"1000":"4"}"></label>
          <label><span>Warning (${uLabel(wdu)})</span>
            <input id="${p}warn_low" type="number" step="${wstep}" placeholder="${wvol?"200":"1.0"}"></label>
          <label class="full"><span>Water color (OK state)</span><div class="crow">
            <input id="${p}color" type="text" placeholder="default blue">
            <input type="color" data-for="${p}color"></div></label>
        </div>`;
    };

    // ── build HTML ──────────────────────────────────────────────────────────
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .ed {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px 16px;
          padding: 4px 0;
          font-family: var(--primary-font-family, sans-serif);
        }
        .full { grid-column: 1 / -1; }
        label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--secondary-text-color); }
        label span, .picker-label { font-weight: 600; font-size: 11px; color: var(--secondary-text-color); }
        input, select {
          padding: 8px 10px;
          border-radius: 6px;
          border: 1px solid var(--divider-color, #e0e0e0);
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color);
          font-size: 13px;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s;
        }
        input:focus, select:focus { border-color: var(--primary-color, #1e88e5); }
        select { cursor: pointer; }
        .sec {
          grid-column: 1 / -1;
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--primary-color, #1e88e5);
          border-top: 1px solid var(--divider-color, #e0e0e0);
          padding-top: 10px; margin-top: 4px;
        }
        .conv { grid-column: 1 / -1; font-size: 11px; color: var(--secondary-text-color); opacity: 0.6; margin-top: -4px; }
        .hint { grid-column: 1 / -1; font-size: 11px; color: var(--secondary-text-color); opacity: 0.65; border-top: 1px solid var(--divider-color, #e0e0e0); padding-top: 10px; line-height: 1.6; }
        .well-block { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; background: var(--secondary-background-color, rgba(0,0,0,.04)); border-radius: 8px; padding: 12px 14px; margin-top: 2px; }
        .wb-title { grid-column: 1 / -1; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--primary-color, #1e88e5); margin-bottom: 2px; }
        .picker-wrap { display: flex; flex-direction: column; gap: 4px; }
        ha-entity-picker { display: block; }
        .crow { display: flex; gap: 8px; align-items: center; }
        .crow input[type=text] { flex: 1; }
        .crow input[type=color] { width: 38px; height: 38px; border-radius: 5px; border: 1px solid var(--divider-color); padding: 2px; cursor: pointer; background: none; flex-shrink: 0; }
        label.cb { flex-direction: row; align-items: center; gap: 8px; cursor: pointer; }
        label.cb input[type=checkbox] { width: 16px; height: 16px; margin: 0; cursor: pointer; }
        label.cb span { font-size: 12px; font-weight: 600; color: var(--primary-text-color); }
      </style>

      <div class="ed">

        <label class="full"><span>Card layout</span>
          <select id="layout">
            ${opt("single", "Single well")}
            ${opt("dual",   "Two wells side-by-side")}
          </select></label>

        <label class="full"><span>Card title</span>
          <input id="name" type="text" placeholder="Well"></label>

        <div class="sec">Element layout</div>
        ${layout === "single" ? `
          <label class="full"><span>Well position</span>
            <select id="well_position">
              ${opt("left",   "⬅  Well left, readings right")}
              ${opt("right",  "➡  Readings left, well right")}
              ${opt("top",    "⬆  Well top, readings bottom")}
              ${opt("bottom", "⬇  Readings top, well bottom")}
            </select></label>
        ` : `
          <label class="full"><span>Arrangement</span>
            <select id="dual_arrangement">
              ${opt("side_by_side", "◫  Side by side (2 columns)")}
              ${opt("stacked",      "☰  Stacked (1 column)")}
            </select></label>
        `}

        <div class="sec">Appearance</div>
        <label><span>Theme</span>
          <select id="theme">
            ${opt("dark",   "🌙 Dark (default)")}
            ${opt("light",  "☀️ Light")}
            ${opt("ha",     "🏠 Follow HA theme")}
            ${opt("custom", "🎨 Custom colors")}
          </select></label>
        <label><span>Well style</span>
          <select id="well_style">
            ${opt("",      "Auto (follow theme)")}
            ${opt("dark",  "Dark well")}
            ${opt("light", "Light well")}
          </select></label>
        <label><span>Font size</span>
          <select id="font_size">
            ${opt("small",  "Small")}
            ${opt("normal", "Normal (default)")}
            ${opt("large",  "Large")}
          </select></label>
        <label class="cb full"><input id="show_title" type="checkbox"><span>Show card title</span></label>

        ${layout === "single" ? `
          <label class="full"><span>Water color (OK state)</span><div class="crow">
            <input id="color" type="text" placeholder="default blue (auto)">
            <input type="color" data-for="color"></div></label>
        ` : ""}

        ${isCustom ? `
          <div class="sec" style="border-top:none;padding-top:0;margin-top:-4px;opacity:.7;font-size:9px;">CUSTOM COLORS</div>
          <label><span>Card background</span><div class="crow">
            <input id="card_background" type="text" placeholder="#0d1b2a">
            <input type="color" data-for="card_background"></div></label>
          <label><span>Border color</span><div class="crow">
            <input id="card_border" type="text" placeholder="#1a2d42">
            <input type="color" data-for="card_border"></div></label>
          <label><span>Text color</span><div class="crow">
            <input id="text_color" type="text" placeholder="#c8d8e8">
            <input type="color" data-for="text_color"></div></label>
          <label><span>Title color</span><div class="crow">
            <input id="title_color" type="text" placeholder="#4a7fa5">
            <input type="color" data-for="title_color"></div></label>
        ` : ""}

        ${layout === "single" ? `
          <div class="sec">Sensor &amp; units</div>
          ${picker("entity",      "Water level sensor *", "")}
          ${picker("entity_pump", "Pump (optional)",      "binary_sensor")}
          <label><span>Sensor unit</span>
            <select id="sensor_unit">${uOpts(UNIT_KEYS)}</select></label>
          <label><span>Display unit</span>
            <select id="display_unit">${uOpts(compat)}</select></label>
          ${su !== du ? `<div class="conv">↳ Auto-convert: ${uLabel(su)} → ${uLabel(du)}</div>` : ""}
          <div class="sec">Range <span style="font-weight:400;opacity:.55">(in ${uLabel(du)})</span></div>
          <label><span>Min — empty</span>
            <input id="min" type="number" step="${step}" placeholder="0"></label>
          <label><span>Max — full</span>
            <input id="max" type="number" step="${step}" placeholder="${vol?"1000":"4"}"></label>
          <label><span>Warning level</span>
            <input id="warn_low" type="number" step="${step}" placeholder="${vol?"200":"1.0"}"></label>
        ` : `
          <div class="sec">Wells</div>
          ${wellBlock(wells[0], 0)}
          ${wellBlock(wells[1], 1)}
        `}

        <div class="hint">
          ${layout === "dual" ? "Each well has its own settings.<br>" : ""}
          Depth: m, cm, mm &nbsp;•&nbsp; Volume: m³, l (YAML key: <b>m3</b>)
        </div>
      </div>`;

    // Must set values as JS properties AFTER innerHTML — the HTML `selected`
    // / `value` attribute approach is unreliable once the DOM is inserted.
    this._applyValues();

    // Init entity pickers (set .hass and .value as JS properties, bind events)
    this._initPickers();

    // Bind all other change events
    this._bindEvents();
  }

  // ── Apply current config values to all form fields ──────────────────────────

  _applyValues() {
    const c = this._config;
    const layout = c.layout || "single";

    const sv = (id, val) => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.value = (val != null ? String(val) : "");
    };
    const cb = (id, val) => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.checked = val !== false;
    };
    // Sync the native colour-wheel next to a hex text input.
    const syncWheel = (f, hex) => {
      const p = this.shadowRoot.querySelector(`input[type=color][data-for="${f}"]`);
      if (p && hex && /^#[0-9a-fA-F]{6}$/.test(hex)) p.value = hex;
    };

    sv("layout",           c.layout           || "single");
    sv("name",             c.name             || "");
    sv("theme",            c.theme            || "dark");
    sv("well_style",       c.well_style       || "");
    sv("well_position",    c.well_position    || "left");
    sv("dual_arrangement", c.dual_arrangement || "side_by_side");
    sv("font_size",        c.font_size        || "normal");
    cb("show_title",       c.show_title);

    if (layout !== "dual") {
      sv("sensor_unit",  c.sensor_unit  || "m");
      sv("display_unit", c.display_unit || c.sensor_unit || "m");
      sv("min",      c.min      != null ? c.min      : "");
      sv("max",      c.max      != null ? c.max      : "");
      sv("warn_low", c.warn_low != null ? c.warn_low : "");
      sv("color",           c.color           || "");
      sv("card_background", c.card_background || "");
      sv("card_border",     c.card_border     || "");
      sv("text_color",      c.text_color      || "");
      sv("title_color",     c.title_color     || "");
      ["color","card_background","card_border","text_color","title_color"]
        .forEach(f => syncWheel(f, c[f]));
    } else {
      [0, 1].forEach(idx => {
        const w = (c.wells || [])[idx] || {};
        const p = "w" + idx + "_";
        sv(p + "name",         w.name         || "");
        sv(p + "sensor_unit",  w.sensor_unit  || "m");
        sv(p + "display_unit", w.display_unit || w.sensor_unit || "m");
        sv(p + "min",      w.min      != null ? w.min      : "");
        sv(p + "max",      w.max      != null ? w.max      : "");
        sv(p + "warn_low", w.warn_low != null ? w.warn_low : "");
        sv(p + "color",    w.color    || "");
        syncWheel(p + "color", w.color);
      });
    }
  }

  // ── Initialise ha-entity-picker elements ────────────────────────────────────

  _initPickers() {
    const c = this._config;

    this.shadowRoot.querySelectorAll("ha-entity-picker").forEach(picker => {
      // Pass hass so the picker can load entity list
      if (this._hass) picker.hass = this._hass;

      // Restrict pump picker to binary_sensor domain
      const domain = picker.dataset.domain;
      if (domain) picker.includeDomains = [domain];

      // Set current value from config
      const field = picker.dataset.field || "";
      const wellMatch = field.match(/^w(\d)_(.+)$/);
      if (wellMatch) {
        const w = (c.wells || [])[+wellMatch[1]] || {};
        picker.value = w[wellMatch[2]] || "";
      } else {
        picker.value = c[field] || "";
      }

      // Listen for selection changes
      // ha-entity-picker fires "value-changed" (not "change")
      picker.addEventListener("value-changed", ev => {
        const val = ev.detail.value || "";
        if (wellMatch) {
          const wIdx = +wellMatch[1];
          const wField = wellMatch[2];
          this._setWell(wIdx, wField, val);
          if (wField === "entity") this._autoUnit(val, wIdx);
        } else {
          this._set(field, val);
          if (field === "entity") this._autoUnit(val, null);
        }
      });
    });
  }

  // ── Event binding for selects / inputs ──────────────────────────────────────

  _bindEvents() {
    const onchange = (id, field, wellIdx) => {
      const el = this.shadowRoot.getElementById(id);
      if (!el) return;
      el.addEventListener("change", () => {
        if (wellIdx != null) this._setWell(wellIdx, field, el.value);
        else this._set(field, el.value);
      });
    };

    // Layout — switching single ↔ dual rebuilds the whole editor
    const layoutEl = this.shadowRoot.getElementById("layout");
    if (layoutEl) {
      layoutEl.addEventListener("change", () => {
        const upd = Object.assign({}, this._config, { layout: layoutEl.value });
        if (layoutEl.value === "dual" && !upd.wells) {
          upd.wells = [Object.assign({}, defaultWell(0)), Object.assign({}, defaultWell(1))];
        }
        this._config = upd;
        this._fire(upd);
        // HA will call setConfig back, which triggers _build; but also
        // rebuild immediately so the user sees the new fields right away.
        this._build();
      });
    }

    // All other top-level fields
    ["name","theme","well_style","well_position","dual_arrangement","font_size",
     "sensor_unit","display_unit","min","max","warn_low","color",
     "card_background","card_border","text_color","title_color"
    ].forEach(f => onchange(f, f, null));

    // Show-title checkbox — different event + .checked instead of .value
    const showTitleEl = this.shadowRoot.getElementById("show_title");
    if (showTitleEl) {
      showTitleEl.addEventListener("change", () => this._set("show_title", showTitleEl.checked));
    }

    // Colour wheel → sync text input. Also routes per-well colour wheels
    // (data-for="w0_color" / "w1_color") to _setWell.
    this.shadowRoot.querySelectorAll("input[type=color][data-for]").forEach(wheel => {
      wheel.addEventListener("input", () => {
        const f = wheel.dataset.for;
        const tx = this.shadowRoot.getElementById(f);
        if (tx) tx.value = wheel.value;
        const m = f.match(/^w(\d)_(.+)$/);
        if (m) this._setWell(+m[1], m[2], wheel.value);
        else this._set(f, wheel.value);
      });
    });

    // Per-well selects / inputs (dual mode)
    [0, 1].forEach(idx => {
      const p = "w" + idx + "_";
      ["name","sensor_unit","display_unit","min","max","warn_low","color"].forEach(f => {
        onchange(p + f, f, idx);
      });
    });
  }

  // ── Config mutation helpers ──────────────────────────────────────────────────

  // Called right after an entity is picked. Reads the entity's
  // unit_of_measurement attribute and — if it maps to one of our supported
  // units — writes it into sensor_unit (top-level or per-well), overwriting
  // any stale default. The subsequent _build repaints the unit dropdowns.
  _autoUnit(entityId, wellIdx) {
    if (!entityId || !this._hass) return;
    const st = this._hass.states[entityId];
    if (!st) return;
    const detected = uFromHA(st.attributes && st.attributes.unit_of_measurement);
    if (!detected) return;
    if (wellIdx != null) this._setWell(wellIdx, "sensor_unit", detected);
    else                 this._set("sensor_unit", detected);
  }

  _set(field, val) {
    const upd = Object.assign({}, this._config);
    const nums = ["min","max","warn_low"];
    if (nums.includes(field)) {
      upd[field] = val === "" ? undefined : +val;
    } else if (val === "" || val == null) {
      delete upd[field];
    } else {
      upd[field] = val;
    }
    if (field === "sensor_unit") {
      // Reset display_unit when it becomes incompatible
      if (!uCompat(val).includes(upd.display_unit)) upd.display_unit = val;
    }
    this._config = upd;
    this._fire(upd);
    // For unit selects: rebuild immediately so the display_unit dropdown
    // repopulates with compatible options and the conversion note updates.
    if (["sensor_unit","display_unit","theme"].includes(field)) this._build();
  }

  _setWell(idx, field, val) {
    const upd = Object.assign({}, this._config);
    upd.wells = (upd.wells || []).slice();
    upd.wells[idx] = Object.assign({}, upd.wells[idx] || {});
    const nums = ["min","max","warn_low"];
    if (nums.includes(field)) {
      upd.wells[idx][field] = val === "" ? undefined : +val;
    } else if (val === "" || val == null) {
      delete upd.wells[idx][field];
    } else {
      upd.wells[idx][field] = val;
    }
    if (field === "sensor_unit") {
      if (!uCompat(val).includes(upd.wells[idx].display_unit)) {
        upd.wells[idx].display_unit = val;
      }
    }
    this._config = upd;
    this._fire(upd);
    if (["sensor_unit","display_unit"].includes(field)) this._build();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration  — editor MUST be defined before the card
// ─────────────────────────────────────────────────────────────────────────────

if (!customElements.get("well-water-card-editor")) {
  customElements.define("well-water-card-editor", WellWaterCardEditor);
}
if (!customElements.get("well-water-card")) {
  customElements.define("well-water-card", WellWaterCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === "well-water-card")) {
  window.customCards.push({
    type:        "well-water-card",
    name:        "Well Water Level Card",
    description: "Animated well — single/dual, themes, unit conversion, flexible layout.",
    preview:     true,
  });
}
