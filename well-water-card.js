/**
 * Well Water Level Card  — v28
 * ──────────────────────────────────────────────────────────────────────────────
 * INSTALLATION (manual)
 *  1. Copy to /config/www/well-water-card.js
 *  2. Settings → Dashboards → Resources → Add
 *     URL: /local/well-water-card.js?v=28   ← version param busts the cache
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
 *   well_style: dark        # dark | light | classic-pump | classic-roof | classic-crank
 *                           # | tank-cylinder | tank-ibc | tank-barrel | tank-horizontal
 *   well_position: left     # left | right | top | bottom
 *   font_size: normal       # small | normal | large
 *   show_title: true        # false hides the card title
 *   show_minmax: true       # false hides the Min / Max row at the bottom
 *   animate: true           # false: flat water surface (no wave animation)
 *   wave_intensity: normal  # calm | normal | lively | choppy  (or a number 0..2)
 *   show_fish: false        # true: a couple of fish swim back and forth in the water
 *   show_history: false     # true: sparkline of recent sensor history below the readings
 *   history_hours: 24       # time range for the history chart in hours
 *   font_family: mono       # mono | ha | sans | serif  (or any CSS font-family string)
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
    textBody:   "#dae7f2",
    // Lighter muted palette — WCAG contrast now ~8–9:1 for textMuted and
    // ~7:1 for textSub on the #0d1b2a card bg.
    textSub:    "#9cbfdd",
    textMuted:  "#b4cbdf",
    titleColor: "#7eafd3",
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
    // Use --secondary-text-color for BOTH sub and muted — the old code used
    // --disabled-text-color for muted, which is typically much too dim on
    // dark HA themes (often ~#555 on black). Now both map to the theme's
    // secondary text color, which is the brightest "not-primary" variable
    // HA provides.
    textSub:    "var(--secondary-text-color, #727272)",
    textMuted:  "var(--secondary-text-color, #727272)",
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
        show_minmax:      config.show_minmax !== false,
        animate:          config.animate !== false,
        wave_intensity:   config.wave_intensity != null ? config.wave_intensity : "normal",
        show_fish:        config.show_fish === true,
        show_history:     config.show_history === true,
        history_hours:    +config.history_hours || 24,
        font_family:      config.font_family    || null,
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
        show_minmax:     true,
        animate:         true,
        wave_intensity:  "normal",
        show_fish:       false,
        show_history:    false,
        history_hours:   24,
        font_family:     null,
        card_background: null,
        card_border:     null,
        text_color:      null,
        title_color:     null,
      }, config);
    }
    this._queue();
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    // Only re-render when an entity we actually track has changed. HA fires
    // `set hass` on every state change in the whole system, so without this
    // guard we rebuild innerHTML many times per second on a busy install —
    // which triggers layout thrashing and makes the dashboard scroll-jump
    // when the card sits near the viewport bottom.
    if (this._shouldRender(oldHass, hass)) this._queue();
    // Fetch history lazily. Gated by show_history and rate-limited to roughly
    // once per 5 minutes so we don't hammer HA's recorder on every state tick.
    if (this._config && this._config.show_history) {
      const age = Date.now() - (this._historyTs || 0);
      if (age > 5 * 60 * 1000) this._fetchHistory();
    }
  }

  _shouldRender(oldHass, newHass) {
    if (!oldHass) return true;                  // first hass — always render
    if (!newHass || !this._config) return false;
    const ids = this._trackedEntities();
    if (ids.length === 0) return true;          // placeholder path
    // Compare state VALUES, not object references. HA replaces the state
    // object on every entity report even when the value is identical (the
    // last_updated/last_reported timestamps change), so a strict-equality
    // check on the object would re-render every report — which on mobile
    // could happen many times per minute and triggers the scroll-jump.
    for (const e of ids) {
      const o = (oldHass.states || {})[e];
      const n = (newHass.states || {})[e];
      if (!o && !n) continue;
      if (!o || !n) return true;
      if (o.state !== n.state) return true;
      const oUnit = o.attributes && o.attributes.unit_of_measurement;
      const nUnit = n.attributes && n.attributes.unit_of_measurement;
      if (oUnit !== nUnit) return true;
    }
    return false;
  }

  _trackedEntities() {
    const c = this._config;
    if (!c) return [];
    const out = [];
    if (c.layout === "dual") {
      (c.wells || []).forEach(w => {
        if (w.entity)      out.push(w.entity);
        if (w.entity_pump) out.push(w.entity_pump);
      });
    } else {
      if (c.entity)      out.push(c.entity);
      if (c.entity_pump) out.push(c.entity_pump);
    }
    return out;
  }

  connectedCallback()    { this._startAnim(); }
  disconnectedCallback() { cancelAnimationFrame(this._animId); }

  // Pull state history for the configured entities from HA's recorder and
  // stash it on `this._historyData` keyed by entity_id. Result format (newer
  // HA): { [entity_id]: [{ s: "1.23", lu: <unix_seconds> }, ...] }.
  async _fetchHistory() {
    if (!this._hass || !this._config || !this._config.show_history) return;
    const entities = this._historyEntityIds();
    if (entities.length === 0) return;
    const hours = Math.max(1, +this._config.history_hours || 24);
    const now   = new Date();
    const start = new Date(now.getTime() - hours * 3600 * 1000);
    // Mark the timestamp BEFORE the await so concurrent hass ticks don't
    // launch a second fetch while this one is in flight.
    this._historyTs = Date.now();
    try {
      const result = await this._hass.callWS({
        type: "history/history_during_period",
        start_time: start.toISOString(),
        end_time: now.toISOString(),
        entity_ids: entities,
        minimal_response: true,
        no_attributes: true,
      });
      this._historyData = result || {};
      this._queue();
    } catch (e) {
      console.warn("[well-water-card] history fetch failed:", e);
    }
  }

  _historyEntityIds() {
    const c = this._config;
    if (!c) return [];
    if (c.layout === "dual") return (c.wells || []).map(w => w.entity).filter(Boolean);
    return c.entity ? [c.entity] : [];
  }

  // Render a small line+area sparkline for one entity. Width is 100% via
  // preserveAspectRatio='none' — the parent flex column sets the actual px.
  _sparkline(entityId, t, color, opts) {
    const h       = (opts && opts.height) || 46;
    const vbW     = 240;
    const data    = this._historyData && this._historyData[entityId];
    if (!data || data.length < 2) return this._sparklineEmpty(t, h, "loading…");
    const pts = [];
    for (const p of data) {
      const v = parseFloat(p.s);
      const ts = (p.lu || 0) * 1000;
      if (!isNaN(v) && ts > 0) pts.push({ t: ts, v });
    }
    if (pts.length < 2) return this._sparklineEmpty(t, h, "no data");
    const tMin = pts[0].t, tMax = pts[pts.length - 1].t;
    const tRng = Math.max(tMax - tMin, 1);
    let vMin = Infinity, vMax = -Infinity;
    for (const p of pts) { if (p.v < vMin) vMin = p.v; if (p.v > vMax) vMax = p.v; }
    const vRng = Math.max(vMax - vMin, 0.01);
    const PAD  = 3;
    const plotH = h - PAD * 2;

    let line = "";
    for (let i = 0; i < pts.length; i++) {
      const x = ((pts[i].t - tMin) / tRng) * vbW;
      const y = PAD + (1 - (pts[i].v - vMin) / vRng) * plotH;
      line += (i === 0 ? "M" : " L") + x.toFixed(1) + "," + y.toFixed(1);
    }
    const area = line + " L" + vbW + "," + h + " L0," + h + " Z";

    return (
      "<svg width='100%' height='" + h + "' viewBox='0 0 " + vbW + " " + h + "' preserveAspectRatio='none' style='display:block;'>" +
        "<path d='" + area + "' fill='" + color + "' opacity='.16'/>" +
        "<path d='" + line + "' fill='none' stroke='" + color + "' stroke-width='1.5' stroke-linejoin='round' stroke-linecap='round' vector-effect='non-scaling-stroke'/>" +
      "</svg>"
    );
  }

  _sparklineEmpty(t, h, msg) {
    return (
      "<div style='height:" + h + "px;display:flex;align-items:center;justify-content:center;" +
        "font-size:11px;color:" + t.textMuted + ";letter-spacing:.1em;text-transform:uppercase;'>" +
        msg +
      "</div>"
    );
  }

  // Header label + sparkline wrapper used by both single and dual renders.
  _historyBlock(entityId, t) {
    if (!this._config || !this._config.show_history || !entityId) return "";
    const hours = +this._config.history_hours || 24;
    const label = hours === 1  ? "LAST HOUR"
                : hours === 24 ? "LAST 24 HOURS"
                : hours < 24   ? "LAST " + hours + " HOURS"
                : hours % 24 === 0 ? "LAST " + (hours / 24) + " DAYS"
                : "LAST " + hours + "H";
    const headerFs = Math.round(11 * this._fontScale());
    return (
      "<div style='margin-top:12px;padding-top:10px;border-top:1px solid " + t.divider + ";'>" +
        "<div style='font-size:" + headerFs + "px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:" + t.textMuted + ";margin-bottom:6px;'>" + label + "</div>" +
        this._sparkline(entityId, t, t.titleColor, { height: 46 }) +
      "</div>"
    );
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _queue() {
    if (!this._pending) {
      this._pending = true;
      requestAnimationFrame(() => { this._pending = false; this._render(); });
    }
  }

  _startAnim() {
    const tick = () => {
      this._animId = requestAnimationFrame(tick);
      // Check the flag at tick time so the checkbox takes effect immediately
      // without restarting anything.
      if (this._config && this._config.animate === false) return;
      this._wave = (this._wave + 0.38) % 360;
      // Each path carries its own water-body height via data-h — dual mode
      // can have two wells at different levels, so a single `d` for all
      // .wp1 paths doesn't cut it.
      this.shadowRoot.querySelectorAll(".wp1").forEach(e => {
        const h = parseFloat(e.dataset.h) || 0;
        e.setAttribute("d", this._wavePath(this._wave, 0, h));
      });
      // Fish animation — smooth pseudo-random motion driven by a blend of
      // sines at co-prime-ish frequencies. Each fish has its own seed so the
      // pair never moves in lockstep, and the pattern doesn't visibly repeat.
      // Facing flips based on instantaneous horizontal velocity sign.
      const ts = performance.now() / 1000;
      this.shadowRoot.querySelectorAll(".fish").forEach(f => {
        const seed  = parseFloat(f.dataset.seed)   || 0;
        const xR    = parseFloat(f.dataset.xrange) || 0;
        const yR    = parseFloat(f.dataset.yrange) || 0;
        const speed = parseFloat(f.dataset.speed)  || 1;
        // Sample two nearby phases — current and slightly earlier — so we can
        // derive direction (flip) from the sign of dx/dt without extra state.
        const xAt = s => {
          // 4 sines, incommensurate frequencies, clamped into [0,1].
          const raw = 0.5
            + 0.30 * Math.sin(s * 0.51 + seed)
            + 0.14 * Math.sin(s * 1.13 + seed * 1.7 + 0.9)
            + 0.08 * Math.sin(s * 2.27 + seed * 0.6 + 2.1)
            + 0.05 * Math.sin(s * 3.41 + seed * 2.3);
          return Math.max(0, Math.min(1, raw));
        };
        const yAt = s =>
          0.55 * Math.sin(s * 0.73 + seed * 1.3 + 1.7) +
          0.35 * Math.sin(s * 1.57 + seed * 0.9) +
          0.15 * Math.sin(s * 2.91 + seed * 2.1 + 0.4);

        const s  = ts * 0.22 * speed + seed;
        const sPrev = s - 0.1;
        const xn   = xAt(s);
        const xnP  = xAt(sPrev);
        const yn   = Math.max(-1, Math.min(1, yAt(s)));
        const x    = xn * xR;
        const y    = yn * yR;
        const flip = xn >= xnP ? 1 : -1;
        f.setAttribute("transform", "translate(" + x.toFixed(2) + "," + y.toFixed(2) + ") scale(" + flip + ",1)");
      });
    };
    this._animId = requestAnimationFrame(tick);
  }

  // The wave path IS the water body: wavy top oscillates around y=0,
  // flat bottom at y=height. Callers translate it to (SX, fillY) so the
  // wavy top lands exactly on the water surface and the flat bottom lands
  // at the shaft floor.
  //
  // Surface shape is three sines blended at co-prime-ish frequencies with
  // different phase speeds, so the pattern never exactly repeats — feels
  // more like natural water than a clean sine wave. Max peak-to-peak is
  // ~4 units (vs a clean-sine amp of 4), but typical instantaneous height
  // is smaller due to phase cancellation — the surface reads as gentle
  // rather than mechanical.
  _wavePath(offset, _variant, height) {
    const rad = offset * Math.PI / 180;
    const W   = 240;
    const H   = Math.max(height || 0, 0);
    const m   = this._waveMult();
    const y = x => {
      const u = x / W * Math.PI * 2;
      return m * (1.2 * Math.sin(u * 1.2 + rad) +
                  0.6 * Math.sin(u * 2.3 + rad * 1.7 + 1.1) +
                  0.7 * Math.sin(u * 0.7 + rad * 0.55 + 2.3));
    };
    let d = "M0," + y(0).toFixed(2);
    for (let x = 4; x <= W; x += 4) {
      d += " L" + x + "," + y(x).toFixed(2);
    }
    return d + " L" + W + "," + H + " L0," + H + " Z";
  }

  // Multiplier applied to all three sine amplitudes in _wavePath. Accepts
  // either a named preset or a raw number (for YAML users who want finer
  // control than the editor presets allow).
  _waveMult() {
    const s = this._config && this._config.wave_intensity;
    if (typeof s === "number" && s >= 0) return s;
    return ({ calm: 0.5, normal: 1.0, lively: 1.5, choppy: 2.2 })[s] || 1.0;
  }

  _fontScale() {
    const s = this._config && this._config.font_size;
    return s === "small" ? 0.85 : s === "large" ? 1.2 : 1.0;
  }

  // Resolve font-family. Named presets map to common stacks; anything else
  // (including raw CSS like "Comic Sans MS, cursive") is passed through.
  _fontFamily() {
    const raw = (this._config && this._config.font_family) || "mono";
    const presets = {
      "mono":  "'JetBrains Mono', 'Courier New', monospace",
      "ha":    "var(--primary-font-family, sans-serif)",
      "sans":  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      "serif": "Georgia, 'Times New Roman', serif",
    };
    return presets[raw] || raw;
  }

  _getTheme() {
    const c = this._config;
    const base = CARD_THEMES[c.theme] || CARD_THEMES.dark;
    const t = Object.assign({}, base);
    if (c.card_background) t.cardBg     = c.card_background;
    if (c.card_border)     t.cardBorder = "1px solid " + c.card_border;
    if (c.text_color)      t.textBody   = c.text_color;
    if (c.title_color)     t.titleColor = c.title_color;
    // t.shaft kept for back-compat with callers that still pass it in; the
    // actual per-well shaft is resolved at render time via _shaftFor(d.wellStyle).
    const wsKey = c.well_style || t.wellStyle || "dark";
    t.shaft = SHAFT_PAL[wsKey] || SHAFT_PAL.dark;
    return t;
  }

  // Resolve the shaft palette for a given well_style. "dark" / "light" modern
  // styles map directly; classic/tank variants fall back to the theme's
  // default shaft (they only use tick colors from it — body colors are baked
  // into each variant's SVG).
  _shaftFor(wellStyle) {
    const c = this._config;
    const themeBase = CARD_THEMES[c.theme] || CARD_THEMES.dark;
    const wsKey = (wellStyle === "dark" || wellStyle === "light")
                    ? wellStyle
                    : (themeBase.wellStyle || "dark");
    return SHAFT_PAL[wsKey] || SHAFT_PAL.dark;
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

    // Per-well style override: well_style on a per-well config wins over the
    // top-level card-wide well_style. Empty string means "use card default".
    const ws = (wcfg.well_style != null && wcfg.well_style !== "")
                 ? wcfg.well_style
                 : (this._config && this._config.well_style);

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
      wellStyle: ws,
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
      "<text x='14' y='" + (t.y + 3.5) + "' text-anchor='end' font-size='9' fill='" + shaft.tickTxt + "' font-family='monospace'>" + t.v + "</text>"
    ).join("");

    const levelLine = level !== null
      ? "<polygon points='78," + fillY + " 83," + (fillY-4) + " 83," + (fillY+4) + "' fill='" + col + "' opacity='.9'/>"
      : "";

    // Level number rendered OUTSIDE the shaft to the right. The SVG viewBox
    // is wider than the shaft so the whole number (incl. decimals) has room.
    const levelLabel = (level !== null && fillH > 20)
      ? "<text x='88' y='" + (fillY + 5) + "' font-size='13' font-weight='700' fill='" + col + "' font-family='monospace' opacity='.92'>" + uFmt(level, unit) + "</text>"
      : "";

    return (
      "<svg width='130' height='260' viewBox='0 0 130 260'>" +
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
      "<text x='7' y='135' text-anchor='middle' font-size='8' fill='" + shaft.tick + "' font-family='monospace' transform='rotate(-90 7 135)'>" + uLabel(unit) + "</text>" +
      "<rect x='26' y='30'  width='6'  height='200' fill='url(#_sg)' rx='2'/>" +
      "<rect x='68' y='30'  width='6'  height='200' fill='" + shaft.wallR + "' rx='2'/>" +
      "<rect x='20' y='22'  width='60' height='10'  fill='" + shaft.cap    + "' rx='3'/>" +
      "<rect x='22' y='20'  width='56' height='4'   fill='" + shaft.capRim + "' rx='2'/>" +
      "<rect x='26' y='228' width='48' height='4'   fill='" + shaft.bottom + "' rx='1'/>" +
      "<g clip-path='url(#_sc)'>" +
        this._waterBody(26, fillY, 48, fillH, "url(#_wg)", colL) +
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
      "<text x='4' y='" + (t.y + 3) + "' text-anchor='end' font-size='8' fill='" + shaft.tickTxt + "' font-family='monospace'>" + t.v + "</text>"
    ).join("");

    const levelLine = level !== null
      ? "<polygon points='" + (SX+SW+3) + "," + fillY + " " + (SX+SW+8) + "," + (fillY-3.5) + " " + (SX+SW+8) + "," + (fillY+3.5) + "' fill='" + col + "' opacity='.9'/>"
      : "";

    const levelLabel = (level !== null && fillH > 15)
      ? "<text x='" + (SX+SW+11) + "' y='" + (fillY+4) + "' font-size='11' font-weight='700' fill='" + col + "' font-family='monospace' opacity='.92'>" + uFmt(level, unit) + "</text>"
      : "";

    const pipeX = SX + Math.floor(SW / 2);

    return (
      "<svg width='110' height='215' viewBox='0 0 110 215'>" +
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
        this._waterBody(SX, fillY, SW, fillH, "url(#" + I + "wg)", colL) +
      "</g>" +
      "<rect x='" + SX + "' y='" + SY + "' width='2' height='" + SH + "' fill='" + shaft.inner + "'/>" +
      levelLine +
      levelLabel +
      "<rect x='" + (pipeX-6) + "' y='4' width='12' height='8' fill='" + shaft.pipe    + "' rx='2'/>" +
      "<rect x='" + (pipeX-4) + "' y='2' width='8'  height='4' fill='" + shaft.pipeRim + "' rx='1'/>" +
      "</svg>"
    );
  }

  // ── Classic variants ─────────────────────────────────────────────────────────
  // Every classic variant keeps the cross-section water view (so sensor level
  // still maps 1:1 to visible fill height). Only the walls and the decoration
  // above the shaft differ. Each function hard-codes its own stone/wood/iron
  // palette; the `shaft` param is still accepted (for tick colors) so existing
  // callers don't have to change. Unique IDs per variant/idx avoid clashes in
  // dual mode.

  _classicShaftInterior(d, shaft, SX, SY, SW, SH, idPre) {
    const { level, pct, unit, col, colL } = d;
    const SB = SY + SH;
    const fillH = pct / 100 * SH;
    const fillY = SB - fillH;

    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
      y: SB - f * SH,
      v: uFmt(d.min + (d.max - d.min) * f, unit),
    }));
    const tickFs  = SH > 170 ? 9 : 8;
    const labelFs = SH > 170 ? 13 : 11;
    const ticksSvg = ticks.map(tk =>
      "<line x1='" + (SX - 10) + "' y1='" + tk.y + "' x2='" + (SX - 1) + "' y2='" + tk.y + "' stroke='" + shaft.tick + "' stroke-width='1'/>" +
      "<text x='" + (SX - 12) + "' y='" + (tk.y + 3.5) + "' text-anchor='end' font-size='" + tickFs + "' fill='" + shaft.tickTxt + "' font-family='monospace'>" + tk.v + "</text>"
    ).join("");

    // Just the side arrow + number — no horizontal stripe across the shaft.
    // The stripe shimmered against the animated wave and added no info the
    // arrow + label don't already convey.
    const levelLine = level !== null
      ? "<polygon points='" + (SX + SW + 4) + "," + fillY + " " + (SX + SW + 9) + "," + (fillY - 4) + " " + (SX + SW + 9) + "," + (fillY + 4) + "' fill='" + col + "' opacity='.9'/>"
      : "";
    const levelLabel = (level !== null && fillH > 20)
      ? "<text x='" + (SX + SW + 14) + "' y='" + (fillY + 5) + "' font-size='" + labelFs + "' font-weight='700' fill='" + col + "' font-family='monospace' opacity='.92'>" + uFmt(level, unit) + "</text>"
      : "";

    return {
      ticksSvg,
      levelLine,
      levelLabel,
      fillY,
      fillH,
      defs:
        "<clipPath id='" + idPre + "sc'><rect x='" + SX + "' y='" + SY + "' width='" + SW + "' height='" + SH + "' rx='2'/></clipPath>" +
        "<linearGradient id='" + idPre + "wg' x1='0' y1='0' x2='0' y2='1'>" +
          "<stop offset='0%' stop-color='" + colL + "' stop-opacity='.9'/>" +
          "<stop offset='100%' stop-color='" + col + "' stop-opacity='1'/>" +
        "</linearGradient>",
      waterFill:
        "<g clip-path='url(#" + idPre + "sc)'>" +
          this._waterBody(SX, fillY, SW, fillH, "url(#" + idPre + "wg)", colL) +
        "</g>",
    };
  }

  // Render the water body: wavy animated top or a flat rect depending on
  // config.animate. The wavy top of wp1 lands exactly at fillY and the flat
  // bottom at fillY+H, so the water surface IS the animated line — one path,
  // one shape. Fish are rendered after the water so they sit on top of it.
  _waterBody(SX, fillY, SW, fillH, fill /* colL unused, kept for callers */) {
    if (fillH <= 0) return "";
    const water = (this._config && this._config.animate === false)
      ? "<rect x='" + SX + "' y='" + fillY + "' width='" + SW + "' height='" + fillH + "' fill='" + fill + "' opacity='.9'/>"
      : ("<g transform='translate(" + SX + "," + fillY + ") scale(" + (SW / 240).toFixed(5) + ",1)'>" +
           "<path class='wp1' data-h='" + fillH + "' d='" + this._wavePath(this._wave, 0, fillH) + "' fill='" + fill + "' opacity='.92'/>" +
         "</g>");
    return water + this._fishSvg(SX, fillY, SW, fillH);
  }

  // Renders 0..N small fish inside the water. Each fish is a <g class="fish">
  // with data-seed / data-xrange / data-yrange / data-speed; the animation
  // loop reads those and computes a smooth pseudo-random position by summing
  // sines at different frequencies — so fish drift in both X and Y in a
  // non-repeating, organic pattern instead of shuttling back and forth.
  _fishSvg(SX, fillY, SW, fillH) {
    const c = this._config;
    if (!c || !c.show_fish || fillH < 22) return "";
    // Each entry: vertical depth (fraction of water column), color, animation
    // speed multiplier, random-looking seed. Seeds differ so the two fish
    // never appear to be in lockstep.
    const school = [
      { depth: 0.35, color: "#ffa726", speed: 1.00, seed: 1.3 },
      { depth: 0.65, color: "#90a4ae", speed: 0.75, seed: 4.7 },
    ];
    const fishW = 11;
    const xRange = Math.max(SW - fishW, 0);
    return school.map(f => {
      const baseY = fillY + fillH * f.depth;
      const baseX = SX + 4;
      // Y drift bounded so the fish can't swim through the surface or floor.
      const yRange = Math.max(0, Math.min(8, fillH * Math.min(f.depth, 1 - f.depth) - 3));
      return "<g transform='translate(" + baseX + "," + baseY.toFixed(2) + ")'>" +
               "<g class='fish' data-seed='" + f.seed + "' data-xrange='" + xRange + "' data-yrange='" + yRange.toFixed(2) + "' data-speed='" + f.speed + "'>" +
                 "<ellipse cx='0' cy='0' rx='3.2' ry='1.6' fill='" + f.color + "' opacity='.92'/>" +
                 "<polygon points='3.2,0 5.8,-2 5.8,2' fill='" + f.color + "' opacity='.92'/>" +
                 "<circle cx='-1.4' cy='-.3' r='.45' fill='#fff'/>" +
               "</g>" +
             "</g>";
    }).join("");
  }

  // ── Classic: stone well with cast-iron hand pump on top ─────────────────────

  _svgPumpLarge(d, shaft) {
    const SX = 26, SY = 70, SW = 48, SH = 200;
    const i = this._classicShaftInterior(d, shaft, SX, SY, SW, SH, "_p");
    const stone = "url(#_pstone)";
    return (
      "<svg width='130' height='290' viewBox='0 0 130 290'>" +
      "<defs>" +
        i.defs +
        "<linearGradient id='_pstone' x1='0' y1='0' x2='1' y2='0'>" +
          "<stop offset='0%' stop-color='#5a6876'/>" +
          "<stop offset='50%' stop-color='#3d4853'/>" +
          "<stop offset='100%' stop-color='#2a323b'/>" +
        "</linearGradient>" +
        "<linearGradient id='_piron' x1='0' y1='0' x2='1' y2='0'>" +
          "<stop offset='0%' stop-color='#2b2b30'/>" +
          "<stop offset='50%' stop-color='#4a4a52'/>" +
          "<stop offset='100%' stop-color='#1f1f24'/>" +
        "</linearGradient>" +
      "</defs>" +
      i.ticksSvg +
      // pump body (cast iron, narrower than shaft)
      "<rect x='42' y='12' width='16' height='50' rx='2' fill='url(#_piron)'/>" +
      "<rect x='40' y='10' width='20' height='4' rx='1' fill='#1a1a1f'/>" +
      // lever (curved left)
      "<path d='M 42 26 Q 25 20 18 32' stroke='#1a1a1f' stroke-width='2.5' fill='none' stroke-linecap='round'/>" +
      "<circle cx='18' cy='32' r='2.5' fill='#6b6b73'/>" +
      // spout (right)
      "<path d='M 58 48 L 78 50 L 78 56 L 58 54 Z' fill='url(#_piron)'/>" +
      "<rect x='76' y='54' width='5' height='2.5' fill='#1a1a1f'/>" +
      // flange between pump and stone rim
      "<rect x='36' y='60' width='28' height='5' rx='1' fill='#1a1a1f'/>" +
      // stone rim (wider than shaft)
      "<rect x='20' y='64' width='60' height='10' fill='" + stone + "' rx='2'/>" +
      "<line x1='34' y1='64' x2='34' y2='74' stroke='#2a323b' stroke-width='1'/>" +
      "<line x1='50' y1='64' x2='50' y2='74' stroke='#2a323b' stroke-width='1'/>" +
      "<line x1='66' y1='64' x2='66' y2='74' stroke='#2a323b' stroke-width='1'/>" +
      // shaft walls (stone)
      "<rect x='" + SX + "' y='" + SY + "' width='6' height='" + SH + "' fill='" + stone + "'/>" +
      "<rect x='" + (SX + SW - 6) + "' y='" + SY + "' width='6' height='" + SH + "' fill='#2a323b'/>" +
      // horizontal stone courses
      [120, 170, 220].map(y =>
        "<line x1='" + SX + "' y1='" + y + "' x2='" + (SX + 6) + "' y2='" + y + "' stroke='#2a323b' stroke-width='.5'/>" +
        "<line x1='" + (SX + SW - 6) + "' y1='" + y + "' x2='" + (SX + SW) + "' y2='" + y + "' stroke='#2a323b' stroke-width='.5'/>"
      ).join("") +
      // bottom
      "<rect x='" + SX + "' y='" + (SY + SH - 2) + "' width='" + SW + "' height='4' fill='#1a1f24' rx='1'/>" +
      // inner shadow + water + level
      "<rect x='" + (SX + 6) + "' y='" + SY + "' width='2' height='" + SH + "' fill='rgba(0,0,0,0.25)'/>" +
      i.waterFill +
      i.levelLine +
      i.levelLabel +
      "</svg>"
    );
  }

  _svgPumpSmall(d, idx, shaft) {
    const SX = 18, SY = 52, SW = 42, SH = 160;
    const I = "p" + idx;
    const i = this._classicShaftInterior(d, shaft, SX, SY, SW, SH, I);
    return (
      "<svg width='110' height='230' viewBox='0 0 110 230'>" +
      "<defs>" +
        i.defs +
        "<linearGradient id='" + I + "stone' x1='0' y1='0' x2='1' y2='0'>" +
          "<stop offset='0%' stop-color='#5a6876'/>" +
          "<stop offset='100%' stop-color='#2a323b'/>" +
        "</linearGradient>" +
      "</defs>" +
      i.ticksSvg +
      // mini pump
      "<rect x='33' y='8' width='14' height='32' rx='2' fill='#3a3a42'/>" +
      "<path d='M 33 18 Q 20 14 14 22' stroke='#1a1a1f' stroke-width='2' fill='none' stroke-linecap='round'/>" +
      "<circle cx='14' cy='22' r='2' fill='#6b6b73'/>" +
      "<path d='M 47 32 L 62 34 L 62 38 L 47 36 Z' fill='#3a3a42'/>" +
      "<rect x='29' y='40' width='22' height='4' fill='#1a1a1f' rx='1'/>" +
      // stone rim
      "<rect x='14' y='44' width='52' height='8' fill='url(#" + I + "stone)' rx='2'/>" +
      // shaft walls
      "<rect x='" + SX + "' y='" + SY + "' width='5' height='" + SH + "' fill='url(#" + I + "stone)'/>" +
      "<rect x='" + (SX + SW - 5) + "' y='" + SY + "' width='5' height='" + SH + "' fill='#2a323b'/>" +
      "<rect x='" + SX + "' y='" + (SY + SH - 2) + "' width='" + SW + "' height='3' fill='#1a1f24' rx='1'/>" +
      i.waterFill +
      i.levelLine +
      i.levelLabel +
      "</svg>"
    );
  }

  // ── Classic: stone well with pitched roof and bucket on rope ────────────────

  _svgRoofLarge(d, shaft) {
    const SX = 26, SY = 80, SW = 48, SH = 200;
    const i = this._classicShaftInterior(d, shaft, SX, SY, SW, SH, "_r");
    const stone = "url(#_rstone)";
    const wood  = "url(#_rwood)";
    return (
      "<svg width='130' height='290' viewBox='0 0 130 290'>" +
      "<defs>" +
        i.defs +
        "<linearGradient id='_rstone' x1='0' y1='0' x2='1' y2='0'>" +
          "<stop offset='0%' stop-color='#5a6876'/><stop offset='50%' stop-color='#3d4853'/><stop offset='100%' stop-color='#2a323b'/>" +
        "</linearGradient>" +
        "<linearGradient id='_rwood' x1='0' y1='0' x2='1' y2='0'>" +
          "<stop offset='0%' stop-color='#6b4a2b'/><stop offset='50%' stop-color='#8a5f3a'/><stop offset='100%' stop-color='#4e3620'/>" +
        "</linearGradient>" +
        "<linearGradient id='_rroof' x1='0' y1='0' x2='0' y2='1'>" +
          "<stop offset='0%' stop-color='#7a3a28'/><stop offset='100%' stop-color='#4a2318'/>" +
        "</linearGradient>" +
      "</defs>" +
      i.ticksSvg +
      // pitched roof
      "<polygon points='10,52 90,52 50,14' fill='url(#_rroof)'/>" +
      "<polygon points='10,52 90,52 50,24' fill='#2a140e' opacity='.35'/>" +
      // ridge board
      "<rect x='8' y='50' width='84' height='4' fill='#2a140e' rx='1'/>" +
      // support posts
      "<rect x='14' y='52' width='5' height='28' fill='" + wood + "'/>" +
      "<rect x='81' y='52' width='5' height='28' fill='" + wood + "'/>" +
      // cross-beam + pulley hub
      "<rect x='14' y='58' width='72' height='4' fill='" + wood + "'/>" +
      "<circle cx='50' cy='60' r='3' fill='#3a2618'/>" +
      // rope + bucket (bucket fixed high in shaft)
      "<line x1='50' y1='62' x2='50' y2='150' stroke='#c9a87a' stroke-width='1.2'/>" +
      "<path d='M 42 150 L 58 150 L 56 164 L 44 164 Z' fill='" + wood + "' stroke='#3a2618' stroke-width='.5'/>" +
      "<line x1='42' y1='150' x2='58' y2='150' stroke='#3a2618' stroke-width='1.2'/>" +
      // stone rim
      "<rect x='20' y='74' width='60' height='8' fill='" + stone + "' rx='2'/>" +
      "<line x1='36' y1='74' x2='36' y2='82' stroke='#2a323b' stroke-width='1'/>" +
      "<line x1='50' y1='74' x2='50' y2='82' stroke='#2a323b' stroke-width='1'/>" +
      "<line x1='64' y1='74' x2='64' y2='82' stroke='#2a323b' stroke-width='1'/>" +
      // shaft walls
      "<rect x='" + SX + "' y='" + SY + "' width='6' height='" + SH + "' fill='" + stone + "'/>" +
      "<rect x='" + (SX + SW - 6) + "' y='" + SY + "' width='6' height='" + SH + "' fill='#2a323b'/>" +
      [130, 180, 230].map(y =>
        "<line x1='" + SX + "' y1='" + y + "' x2='" + (SX + 6) + "' y2='" + y + "' stroke='#2a323b' stroke-width='.5'/>" +
        "<line x1='" + (SX + SW - 6) + "' y1='" + y + "' x2='" + (SX + SW) + "' y2='" + y + "' stroke='#2a323b' stroke-width='.5'/>"
      ).join("") +
      "<rect x='" + SX + "' y='" + (SY + SH - 2) + "' width='" + SW + "' height='4' fill='#1a1f24' rx='1'/>" +
      "<rect x='" + (SX + 6) + "' y='" + SY + "' width='2' height='" + SH + "' fill='rgba(0,0,0,0.25)'/>" +
      i.waterFill +
      i.levelLine +
      i.levelLabel +
      "</svg>"
    );
  }

  _svgRoofSmall(d, idx, shaft) {
    const SX = 18, SY = 62, SW = 42, SH = 150;
    const I = "r" + idx;
    const i = this._classicShaftInterior(d, shaft, SX, SY, SW, SH, I);
    return (
      "<svg width='110' height='230' viewBox='0 0 110 230'>" +
      "<defs>" +
        i.defs +
        "<linearGradient id='" + I + "stone' x1='0' y1='0' x2='1' y2='0'><stop offset='0%' stop-color='#5a6876'/><stop offset='100%' stop-color='#2a323b'/></linearGradient>" +
        "<linearGradient id='" + I + "roof' x1='0' y1='0' x2='0' y2='1'><stop offset='0%' stop-color='#7a3a28'/><stop offset='100%' stop-color='#4a2318'/></linearGradient>" +
      "</defs>" +
      i.ticksSvg +
      "<polygon points='8,38 72,38 40,8' fill='url(#" + I + "roof)'/>" +
      "<rect x='6' y='36' width='68' height='3' fill='#2a140e' rx='1'/>" +
      "<rect x='12' y='38' width='4' height='22' fill='#6b4a2b'/>" +
      "<rect x='64' y='38' width='4' height='22' fill='#6b4a2b'/>" +
      "<rect x='12' y='44' width='56' height='3' fill='#6b4a2b'/>" +
      "<line x1='40' y1='47' x2='40' y2='110' stroke='#c9a87a' stroke-width='1'/>" +
      "<rect x='34' y='110' width='12' height='10' fill='#6b4a2b' stroke='#3a2618' stroke-width='.5'/>" +
      "<rect x='14' y='56' width='52' height='6' fill='url(#" + I + "stone)' rx='1'/>" +
      "<rect x='" + SX + "' y='" + SY + "' width='5' height='" + SH + "' fill='url(#" + I + "stone)'/>" +
      "<rect x='" + (SX + SW - 5) + "' y='" + SY + "' width='5' height='" + SH + "' fill='#2a323b'/>" +
      "<rect x='" + SX + "' y='" + (SY + SH - 2) + "' width='" + SW + "' height='3' fill='#1a1f24' rx='1'/>" +
      i.waterFill +
      i.levelLine +
      i.levelLabel +
      "</svg>"
    );
  }

  // ── Classic: wooden well with drum + crank handle ───────────────────────────

  _svgCrankLarge(d, shaft) {
    const SX = 26, SY = 75, SW = 48, SH = 200;
    const i = this._classicShaftInterior(d, shaft, SX, SY, SW, SH, "_c");
    const wood = "url(#_cwood)";
    return (
      "<svg width='130' height='290' viewBox='0 0 130 290'>" +
      "<defs>" +
        i.defs +
        "<linearGradient id='_cwood' x1='0' y1='0' x2='1' y2='0'>" +
          "<stop offset='0%' stop-color='#8a5f3a'/><stop offset='50%' stop-color='#6b4428'/><stop offset='100%' stop-color='#3a2618'/>" +
        "</linearGradient>" +
        "<linearGradient id='_cdrum' x1='0' y1='0' x2='0' y2='1'>" +
          "<stop offset='0%' stop-color='#8a5f3a'/><stop offset='100%' stop-color='#4e3620'/>" +
        "</linearGradient>" +
      "</defs>" +
      i.ticksSvg +
      // support posts
      "<rect x='16' y='30' width='5' height='40' fill='" + wood + "'/>" +
      "<rect x='79' y='30' width='5' height='40' fill='" + wood + "'/>" +
      // drum
      "<rect x='21' y='40' width='58' height='14' rx='2' fill='url(#_cdrum)'/>" +
      "<ellipse cx='21' cy='47' rx='3' ry='7' fill='#3a2618'/>" +
      "<ellipse cx='79' cy='47' rx='3' ry='7' fill='#3a2618'/>" +
      "<line x1='24' y1='44' x2='76' y2='44' stroke='#3a2618' stroke-width='.5' opacity='.6'/>" +
      "<line x1='24' y1='50' x2='76' y2='50' stroke='#3a2618' stroke-width='.5' opacity='.6'/>" +
      // crank (right)
      "<line x1='85' y1='47' x2='93' y2='47' stroke='#4a4a52' stroke-width='2.5'/>" +
      "<line x1='93' y1='47' x2='93' y2='60' stroke='#4a4a52' stroke-width='2.5'/>" +
      "<circle cx='93' cy='60' r='2.5' fill='#8a5f3a'/>" +
      // rope + bucket
      "<line x1='50' y1='54' x2='50' y2='160' stroke='#c9a87a' stroke-width='1.2'/>" +
      "<path d='M 42 160 L 58 160 L 56 174 L 44 174 Z' fill='" + wood + "' stroke='#3a2618' stroke-width='.5'/>" +
      "<line x1='42' y1='160' x2='58' y2='160' stroke='#3a2618' stroke-width='1.2'/>" +
      // wooden rim (plank divisions)
      "<rect x='20' y='68' width='60' height='8' fill='" + wood + "' rx='1'/>" +
      "<line x1='36' y1='68' x2='36' y2='76' stroke='#3a2618' stroke-width='.8'/>" +
      "<line x1='50' y1='68' x2='50' y2='76' stroke='#3a2618' stroke-width='.8'/>" +
      "<line x1='64' y1='68' x2='64' y2='76' stroke='#3a2618' stroke-width='.8'/>" +
      // shaft walls (wooden)
      "<rect x='" + SX + "' y='" + SY + "' width='6' height='" + SH + "' fill='" + wood + "'/>" +
      "<rect x='" + (SX + SW - 6) + "' y='" + SY + "' width='6' height='" + SH + "' fill='#3a2618'/>" +
      [125, 175, 225].map(y =>
        "<line x1='" + SX + "' y1='" + y + "' x2='" + (SX + 6) + "' y2='" + y + "' stroke='#3a2618' stroke-width='.5'/>" +
        "<line x1='" + (SX + SW - 6) + "' y1='" + y + "' x2='" + (SX + SW) + "' y2='" + y + "' stroke='#3a2618' stroke-width='.5'/>"
      ).join("") +
      "<rect x='" + SX + "' y='" + (SY + SH - 2) + "' width='" + SW + "' height='4' fill='#1a1f24' rx='1'/>" +
      "<rect x='" + (SX + 6) + "' y='" + SY + "' width='2' height='" + SH + "' fill='rgba(0,0,0,0.28)'/>" +
      i.waterFill +
      i.levelLine +
      i.levelLabel +
      "</svg>"
    );
  }

  _svgCrankSmall(d, idx, shaft) {
    const SX = 18, SY = 58, SW = 42, SH = 154;
    const I = "k" + idx;
    const i = this._classicShaftInterior(d, shaft, SX, SY, SW, SH, I);
    return (
      "<svg width='110' height='230' viewBox='0 0 110 230'>" +
      "<defs>" +
        i.defs +
        "<linearGradient id='" + I + "wood' x1='0' y1='0' x2='1' y2='0'><stop offset='0%' stop-color='#8a5f3a'/><stop offset='100%' stop-color='#3a2618'/></linearGradient>" +
      "</defs>" +
      i.ticksSvg +
      "<rect x='10' y='20' width='4' height='28' fill='url(#" + I + "wood)'/>" +
      "<rect x='66' y='20' width='4' height='28' fill='url(#" + I + "wood)'/>" +
      "<rect x='14' y='28' width='52' height='10' rx='2' fill='url(#" + I + "wood)'/>" +
      "<line x1='72' y1='33' x2='78' y2='33' stroke='#4a4a52' stroke-width='2'/>" +
      "<line x1='78' y1='33' x2='78' y2='43' stroke='#4a4a52' stroke-width='2'/>" +
      "<line x1='40' y1='38' x2='40' y2='120' stroke='#c9a87a' stroke-width='1'/>" +
      "<rect x='34' y='120' width='12' height='10' fill='#6b4428' stroke='#3a2618' stroke-width='.5'/>" +
      "<rect x='14' y='52' width='52' height='6' fill='url(#" + I + "wood)' rx='1'/>" +
      "<rect x='" + SX + "' y='" + SY + "' width='5' height='" + SH + "' fill='url(#" + I + "wood)'/>" +
      "<rect x='" + (SX + SW - 5) + "' y='" + SY + "' width='5' height='" + SH + "' fill='#3a2618'/>" +
      "<rect x='" + SX + "' y='" + (SY + SH - 2) + "' width='" + SW + "' height='3' fill='#1a1f24' rx='1'/>" +
      i.waterFill +
      i.levelLine +
      i.levelLabel +
      "</svg>"
    );
  }

  // ── Water-tank variants ─────────────────────────────────────────────────────
  // Same contract as the classic variants: reuse _classicShaftInterior for the
  // water + ticks + level arrow/label; wrap with tank-specific decoration.

  // ── Cylindrical poly / plastic tank (white, domed top, base stand) ─────────

  _svgTankCylLarge(d, shaft) {
    const SX = 29, SY = 70, SW = 72, SH = 190;
    const i = this._classicShaftInterior(d, shaft, SX, SY, SW, SH, "_tc");
    return (
      "<svg width='130' height='290' viewBox='0 0 130 290'>" +
      "<defs>" +
        i.defs +
        "<linearGradient id='_tcwall' x1='0' y1='0' x2='1' y2='0'>" +
          "<stop offset='0%' stop-color='#9aa8b2'/><stop offset='35%' stop-color='#e0e6eb'/>" +
          "<stop offset='65%' stop-color='#c5ccd2'/><stop offset='100%' stop-color='#7b8890'/>" +
        "</linearGradient>" +
        "<linearGradient id='_tcdome' x1='0' y1='0' x2='0' y2='1'>" +
          "<stop offset='0%' stop-color='#e8edf0'/><stop offset='100%' stop-color='#b2bbc2'/>" +
        "</linearGradient>" +
      "</defs>" +
      i.ticksSvg +
      // inlet cap
      "<rect x='59' y='42' width='12' height='8' fill='#6b7680' rx='1'/>" +
      "<rect x='57' y='40' width='16' height='4' fill='#4a5660' rx='1'/>" +
      // dome top
      "<path d='M " + SX + " " + SY + " Q 65 42 " + (SX + SW) + " " + SY + " Z' fill='url(#_tcdome)'/>" +
      // cylinder body
      "<rect x='" + SX + "' y='" + SY + "' width='" + SW + "' height='" + SH + "' fill='url(#_tcwall)'/>" +
      // seam ribs
      [120, 170, 220].map(y => "<line x1='" + SX + "' y1='" + y + "' x2='" + (SX + SW) + "' y2='" + y + "' stroke='#7b8890' stroke-width='.5' opacity='.5'/>").join("") +
      // base stand
      "<rect x='25' y='260' width='80' height='6' fill='#4a5660' rx='1'/>" +
      "<rect x='23' y='264' width='84' height='5' fill='#2d353c' rx='1'/>" +
      // outlet spigot lower-right
      "<rect x='" + (SX + SW) + "' y='235' width='10' height='6' fill='#6b7680'/>" +
      "<rect x='" + (SX + SW + 8) + "' y='233' width='3' height='10' fill='#4a5660'/>" +
      i.waterFill +
      i.levelLine +
      i.levelLabel +
      "</svg>"
    );
  }

  _svgTankCylSmall(d, idx, shaft) {
    const SX = 18, SY = 50, SW = 56, SH = 150;
    const I = "tc" + idx;
    const i = this._classicShaftInterior(d, shaft, SX, SY, SW, SH, I);
    return (
      "<svg width='110' height='230' viewBox='0 0 110 230'>" +
      "<defs>" +
        i.defs +
        "<linearGradient id='" + I + "wall' x1='0' y1='0' x2='1' y2='0'><stop offset='0%' stop-color='#9aa8b2'/><stop offset='50%' stop-color='#e0e6eb'/><stop offset='100%' stop-color='#7b8890'/></linearGradient>" +
      "</defs>" +
      i.ticksSvg +
      "<rect x='42' y='26' width='8' height='6' fill='#4a5660'/>" +
      "<path d='M " + SX + " " + SY + " Q 46 28 " + (SX + SW) + " " + SY + " Z' fill='#c5ccd2'/>" +
      "<rect x='" + SX + "' y='" + SY + "' width='" + SW + "' height='" + SH + "' fill='url(#" + I + "wall)'/>" +
      "<line x1='" + SX + "' y1='100' x2='" + (SX + SW) + "' y2='100' stroke='#7b8890' stroke-width='.5' opacity='.5'/>" +
      "<line x1='" + SX + "' y1='150' x2='" + (SX + SW) + "' y2='150' stroke='#7b8890' stroke-width='.5' opacity='.5'/>" +
      "<rect x='15' y='" + (SY + SH + 3) + "' width='62' height='5' fill='#4a5660' rx='1'/>" +
      i.waterFill +
      i.levelLine +
      i.levelLabel +
      "</svg>"
    );
  }

  // ── IBC tote (plastic bladder in galvanized steel cage on wooden pallet) ───

  _svgTankIbcLarge(d, shaft) {
    const SX = 25, SY = 50, SW = 80, SH = 180;
    const i = this._classicShaftInterior(d, shaft, SX, SY, SW, SH, "_ti");
    return (
      "<svg width='130' height='290' viewBox='0 0 130 290'>" +
      "<defs>" +
        i.defs +
        "<linearGradient id='_tiplastic' x1='0' y1='0' x2='1' y2='0'>" +
          "<stop offset='0%' stop-color='#d8dde0'/><stop offset='50%' stop-color='#f0f2f4'/>" +
          "<stop offset='100%' stop-color='#a8b0b5'/>" +
        "</linearGradient>" +
      "</defs>" +
      i.ticksSvg +
      // top inlet cap
      "<rect x='57' y='30' width='16' height='12' fill='#2b2b2b' rx='1'/>" +
      "<rect x='55' y='42' width='20' height='4' fill='#1a1a1a'/>" +
      // plastic bladder
      "<rect x='" + SX + "' y='" + SY + "' width='" + SW + "' height='" + SH + "' fill='url(#_tiplastic)' rx='2'/>" +
      i.waterFill +
      // steel cage
      "<g stroke='#4a4a4a' stroke-width='1.2' fill='none' opacity='.88'>" +
        "<rect x='23' y='48' width='84' height='184' rx='1'/>" +
        [39, 55, 71, 87].map(x => "<line x1='" + x + "' y1='48' x2='" + x + "' y2='232'/>").join("") +
        [78, 110, 142, 174, 206].map(y => "<line x1='23' y1='" + y + "' x2='107' y2='" + y + "'/>").join("") +
      "</g>" +
      // pallet
      "<rect x='19' y='234' width='92' height='6' fill='#8a5f3a'/>" +
      "<rect x='19' y='240' width='92' height='4' fill='#6b4428'/>" +
      "<line x1='37' y1='234' x2='37' y2='244' stroke='#4e3620' stroke-width='1'/>" +
      "<line x1='65' y1='234' x2='65' y2='244' stroke='#4e3620' stroke-width='1'/>" +
      "<line x1='93' y1='234' x2='93' y2='244' stroke='#4e3620' stroke-width='1'/>" +
      // outlet valve
      "<rect x='" + (SX + SW) + "' y='213' width='8' height='6' fill='#4a4a4a'/>" +
      "<rect x='" + (SX + SW + 6) + "' y='211' width='4' height='10' fill='#2b2b2b'/>" +
      i.levelLine +
      i.levelLabel +
      "</svg>"
    );
  }

  _svgTankIbcSmall(d, idx, shaft) {
    const SX = 16, SY = 38, SW = 60, SH = 140;
    const I = "ti" + idx;
    const i = this._classicShaftInterior(d, shaft, SX, SY, SW, SH, I);
    return (
      "<svg width='110' height='230' viewBox='0 0 110 230'>" +
      "<defs>" +
        i.defs +
        "<linearGradient id='" + I + "plastic' x1='0' y1='0' x2='1' y2='0'><stop offset='0%' stop-color='#d8dde0'/><stop offset='50%' stop-color='#f0f2f4'/><stop offset='100%' stop-color='#a8b0b5'/></linearGradient>" +
      "</defs>" +
      i.ticksSvg +
      "<rect x='40' y='22' width='12' height='10' fill='#2b2b2b' rx='1'/>" +
      "<rect x='" + SX + "' y='" + SY + "' width='" + SW + "' height='" + SH + "' fill='url(#" + I + "plastic)' rx='1'/>" +
      i.waterFill +
      "<g stroke='#4a4a4a' stroke-width='1' fill='none' opacity='.85'>" +
        "<rect x='14' y='36' width='64' height='144' rx='1'/>" +
        [28, 44, 60].map(x => "<line x1='" + x + "' y1='36' x2='" + x + "' y2='180'/>").join("") +
        [66, 96, 126, 156].map(y => "<line x1='14' y1='" + y + "' x2='78' y2='" + y + "'/>").join("") +
      "</g>" +
      "<rect x='11' y='182' width='70' height='5' fill='#8a5f3a'/>" +
      "<rect x='11' y='187' width='70' height='3' fill='#6b4428'/>" +
      i.levelLine +
      i.levelLabel +
      "</svg>"
    );
  }

  // ── Wooden rain barrel (staves, iron bands, downspout, brass tap) ──────────

  _svgTankBarrelLarge(d, shaft) {
    const SX = 25, SY = 60, SW = 80, SH = 180;
    const i = this._classicShaftInterior(d, shaft, SX, SY, SW, SH, "_tb");
    return (
      "<svg width='130' height='290' viewBox='0 0 130 290'>" +
      "<defs>" +
        i.defs +
        "<linearGradient id='_tbwood' x1='0' y1='0' x2='1' y2='0'>" +
          "<stop offset='0%' stop-color='#8a5f3a'/><stop offset='50%' stop-color='#a57349'/><stop offset='100%' stop-color='#5e3f26'/>" +
        "</linearGradient>" +
      "</defs>" +
      i.ticksSvg +
      // downspout input
      "<rect x='89' y='38' width='8' height='22' fill='#4a4a4a'/>" +
      "<rect x='87' y='36' width='12' height='4' fill='#2b2b2b'/>" +
      // barrel top rim ellipse
      "<ellipse cx='65' cy='" + SY + "' rx='40' ry='10' fill='url(#_tbwood)'/>" +
      // barrel body
      "<rect x='" + SX + "' y='" + SY + "' width='" + SW + "' height='" + SH + "' fill='url(#_tbwood)'/>" +
      // bottom cap ellipse
      "<ellipse cx='65' cy='" + (SY + SH) + "' rx='40' ry='10' fill='#4e3620'/>" +
      // stave lines
      "<g stroke='#4e3620' stroke-width='.8' opacity='.7'>" +
        [35, 47, 59, 71, 83, 95].map(x => "<line x1='" + x + "' y1='" + SY + "' x2='" + x + "' y2='" + (SY + SH) + "'/>").join("") +
      "</g>" +
      // iron bands
      "<rect x='23' y='70' width='84' height='5' fill='#6b6b73'/>" +
      "<rect x='23' y='72' width='84' height='1' fill='#2b2b30'/>" +
      "<rect x='23' y='220' width='84' height='5' fill='#6b6b73'/>" +
      "<rect x='23' y='222' width='84' height='1' fill='#2b2b30'/>" +
      i.waterFill +
      // slight water-surface ellipse for 3D hint (only if water present)
      (d.level !== null && (d.pct > 3)
        ? "<ellipse cx='65' cy='" + (SY + SH - d.pct / 100 * SH).toFixed(2) + "' rx='40' ry='5' fill='#42a5f5' opacity='.7'/>"
        : "") +
      // brass tap
      "<rect x='55' y='225' width='20' height='6' fill='#c09840'/>" +
      "<rect x='63' y='231' width='4' height='10' fill='#8a6a28'/>" +
      "<circle cx='65' cy='243' r='3' fill='#c09840'/>" +
      i.levelLine +
      i.levelLabel +
      "</svg>"
    );
  }

  _svgTankBarrelSmall(d, idx, shaft) {
    const SX = 16, SY = 44, SW = 60, SH = 140;
    const I = "tb" + idx;
    const i = this._classicShaftInterior(d, shaft, SX, SY, SW, SH, I);
    return (
      "<svg width='110' height='230' viewBox='0 0 110 230'>" +
      "<defs>" +
        i.defs +
        "<linearGradient id='" + I + "wood' x1='0' y1='0' x2='1' y2='0'><stop offset='0%' stop-color='#8a5f3a'/><stop offset='50%' stop-color='#a57349'/><stop offset='100%' stop-color='#5e3f26'/></linearGradient>" +
      "</defs>" +
      i.ticksSvg +
      "<rect x='60' y='28' width='6' height='16' fill='#4a4a4a'/>" +
      "<ellipse cx='46' cy='" + SY + "' rx='30' ry='7' fill='url(#" + I + "wood)'/>" +
      "<rect x='" + SX + "' y='" + SY + "' width='" + SW + "' height='" + SH + "' fill='url(#" + I + "wood)'/>" +
      "<ellipse cx='46' cy='" + (SY + SH) + "' rx='30' ry='7' fill='#4e3620'/>" +
      "<g stroke='#4e3620' stroke-width='.6' opacity='.7'>" +
        [26, 36, 46, 56, 66].map(x => "<line x1='" + x + "' y1='" + SY + "' x2='" + x + "' y2='" + (SY + SH) + "'/>").join("") +
      "</g>" +
      "<rect x='14' y='52' width='64' height='4' fill='#6b6b73'/>" +
      "<rect x='14' y='178' width='64' height='4' fill='#6b6b73'/>" +
      i.waterFill +
      "<rect x='40' y='184' width='14' height='4' fill='#c09840'/>" +
      "<rect x='45' y='188' width='3' height='6' fill='#8a6a28'/>" +
      i.levelLine +
      i.levelLabel +
      "</svg>"
    );
  }

  // ── Horizontal cylinder tank on saddles (propane / pressure tank look) ─────
  // Uses its own interior helper — the capsule clip shape and the low-aspect
  // layout don't fit the vertical _classicShaftInterior assumptions.

  _svgTankHorizLarge(d, shaft) {
    // Wider canvas so the level number on the right isn't clipped, and the
    // tick labels on the left have room. Taller body so the tank fills more
    // of the 290px SVG slot when mixed with vertical styles.
    return this._horizTankSvg(d, shaft, {
      W: 290, H: 220,
      bodyX: 70, bodyY: 50, bodyW: 140, bodyH: 160, capR: 30,
      idPre: "_th",
      ticks: true,
    });
  }

  _svgTankHorizSmall(d, idx, shaft) {
    return this._horizTankSvg(d, shaft, {
      W: 220, H: 170,
      bodyX: 46, bodyY: 40, bodyW: 100, bodyH: 100, capR: 22,
      idPre: "th" + idx,
      ticks: false,
    });
  }

  _horizTankSvg(d, shaft, o) {
    const { W, H, bodyX, bodyY, bodyW, bodyH, capR, idPre, ticks } = o;
    const { level, col, colL, unit } = d;
    const SX = bodyX - capR, SY = bodyY, SW = bodyW + 2 * capR, SH = bodyH;
    const SB = SY + SH;
    const fillH = (d.pct / 100) * SH;
    const fillY = SB - fillH;

    const capsulePath =
      "M " + bodyX + " " + SY +
      " L " + (bodyX + bodyW) + " " + SY +
      " A " + capR + " " + (SH / 2) + " 0 0 1 " + (bodyX + bodyW) + " " + (SY + SH) +
      " L " + bodyX + " " + (SY + SH) +
      " A " + capR + " " + (SH / 2) + " 0 0 1 " + bodyX + " " + SY + " Z";

    // Tick marks on the left end cap (0, 50%, 100%)
    const tickSvg = ticks
      ? [0, 0.5, 1].map(f => {
          const y = SB - f * SH;
          const v = uFmt(d.min + (d.max - d.min) * f, unit);
          return "<line x1='" + (SX - 9) + "' y1='" + y + "' x2='" + (SX - 1) + "' y2='" + y + "' stroke='" + shaft.tick + "' stroke-width='1'/>" +
                 "<text x='" + (SX - 11) + "' y='" + (y + 3.5) + "' text-anchor='end' font-size='9' fill='" + shaft.tickTxt + "' font-family='monospace'>" + v + "</text>";
        }).join("")
      : "";

    const levelArrow = level !== null
      ? "<polygon points='" + (bodyX + bodyW + capR - 2) + "," + fillY + " " + (bodyX + bodyW + capR + 4) + "," + (fillY - 4) + " " + (bodyX + bodyW + capR + 4) + "," + (fillY + 4) + "' fill='" + col + "' opacity='.9'/>"
      : "";
    const levelLabel = (level !== null && fillH > 10)
      ? "<text x='" + (bodyX + bodyW + capR + 9) + "' y='" + (fillY + 5) + "' font-size='" + (ticks ? 13 : 11) + "' font-weight='700' fill='" + col + "' font-family='monospace' opacity='.92'>" + uFmt(level, unit) + "</text>"
      : "";

    return (
      "<svg width='" + W + "' height='" + H + "' viewBox='0 0 " + W + " " + H + "'>" +
      "<defs>" +
        "<linearGradient id='" + idPre + "body' x1='0' y1='0' x2='0' y2='1'>" +
          "<stop offset='0%' stop-color='#c8ced3'/><stop offset='30%' stop-color='#eef1f3'/>" +
          "<stop offset='60%' stop-color='#a0a8ae'/><stop offset='100%' stop-color='#626a70'/>" +
        "</linearGradient>" +
        "<linearGradient id='" + idPre + "wg' x1='0' y1='0' x2='0' y2='1'>" +
          "<stop offset='0%' stop-color='" + colL + "' stop-opacity='.9'/>" +
          "<stop offset='100%' stop-color='" + col + "' stop-opacity='1'/>" +
        "</linearGradient>" +
        "<clipPath id='" + idPre + "clip'><path d='" + capsulePath + "'/></clipPath>" +
      "</defs>" +
      tickSvg +
      // tank body
      "<path d='" + capsulePath + "' fill='url(#" + idPre + "body)'/>" +
      // welds between sections
      "<line x1='" + (bodyX + bodyW * 0.33) + "' y1='" + SY + "' x2='" + (bodyX + bodyW * 0.33) + "' y2='" + SB + "' stroke='#7b8088' stroke-width='.5' opacity='.6'/>" +
      "<line x1='" + (bodyX + bodyW * 0.67) + "' y1='" + SY + "' x2='" + (bodyX + bodyW * 0.67) + "' y2='" + SB + "' stroke='#7b8088' stroke-width='.5' opacity='.6'/>" +
      // water fill clipped to capsule
      "<g clip-path='url(#" + idPre + "clip)'>" +
        this._waterBody(SX, fillY, SW, fillH, "url(#" + idPre + "wg)") +
      "</g>" +
      // top hatch
      "<rect x='" + (bodyX + bodyW / 2 - 12) + "' y='" + (SY - 10) + "' width='24' height='10' fill='#4a5660' rx='1'/>" +
      "<rect x='" + (bodyX + bodyW / 2 - 14) + "' y='" + (SY - 12) + "' width='28' height='4' fill='#2d353c' rx='1'/>" +
      // saddles
      "<rect x='" + (bodyX + 16) + "' y='" + SB + "' width='28' height='10' fill='#4a4a4a' rx='1'/>" +
      "<rect x='" + (bodyX + bodyW - 44) + "' y='" + SB + "' width='28' height='10' fill='#4a4a4a' rx='1'/>" +
      "<rect x='" + (bodyX + 8) + "' y='" + (SB + 8) + "' width='44' height='5' fill='#2d353c'/>" +
      "<rect x='" + (bodyX + bodyW - 52) + "' y='" + (SB + 8) + "' width='44' height='5' fill='#2d353c'/>" +
      levelArrow +
      levelLabel +
      "</svg>"
    );
  }

  // ── SVG dispatcher ──────────────────────────────────────────────────────────
  // Routes to the right SVG builder based on well_style. Unknown styles fall
  // back to the modern (dark/light) renderer so existing configs keep working.

  // The caller's `shaft` is ignored when the resolved per-well style differs
  // from it — we recompute the shaft from d.wellStyle so each well in dual
  // mode can have its own look (modern-dark, modern-light, a classic, or a
  // tank variant) independently.
  _renderSvg(d, _shaft, size, idx) {
    const style = d.wellStyle;
    const shaft = this._shaftFor(style);
    const small = size === "small";
    switch (style) {
      case "classic-pump":    return small ? this._svgPumpSmall(d, idx || 0, shaft)      : this._svgPumpLarge(d, shaft);
      case "classic-roof":    return small ? this._svgRoofSmall(d, idx || 0, shaft)      : this._svgRoofLarge(d, shaft);
      case "classic-crank":   return small ? this._svgCrankSmall(d, idx || 0, shaft)     : this._svgCrankLarge(d, shaft);
      case "tank-cylinder":   return small ? this._svgTankCylSmall(d, idx || 0, shaft)   : this._svgTankCylLarge(d, shaft);
      case "tank-ibc":        return small ? this._svgTankIbcSmall(d, idx || 0, shaft)   : this._svgTankIbcLarge(d, shaft);
      case "tank-barrel":     return small ? this._svgTankBarrelSmall(d, idx || 0, shaft): this._svgTankBarrelLarge(d, shaft);
      case "tank-horizontal": return small ? this._svgTankHorizSmall(d, idx || 0, shaft) : this._svgTankHorizLarge(d, shaft);
      default:                return small ? this._svgSmall(d, idx || 0, shaft)          : this._svgLarge(d, shaft);
    }
  }

  // ── Shared CSS ───────────────────────────────────────────────────────────────

  _css(t) {
    const ff = this._fontFamily();
    return (
      // No height:100% on :host — on mobile, dynamic viewport changes
      // (address-bar show/hide) propagated through the height chain and
      // triggered reflows that the browser's scroll-restoration logic
      // mishandled, kicking the dashboard back to the top. ha-card keeps
      // height:100% so it still fills a Sections-grid cell when HA gives
      // it a fixed row span; that direction works because the parent has
      // a real height.
      ":host { display: block; font-family: " + ff + "; }" +
      "ha-card { display: block; height: 100%; }" +
      // Let SVGs shrink with the card while preserving their viewBox aspect.
      // Without this the wider styles (notably tank-horizontal at 290px)
      // hit the card's left/right edges on a narrow column. height:auto
      // keeps the proportions when width is squeezed by max-width:100%.
      "svg { max-width: 100%; height: auto; display: block; }" +
      // contain: paint isolates this card's repaints from the document
      // scroll; overflow-anchor:none opts the card out of being chosen
      // as a scroll anchor (the browser was picking it, then losing
      // anchor state on innerHTML replacement, then snapping to top).
      ".card { background: " + t.cardBg + "; border: " + t.cardBorder + "; border-radius: 16px; color: " + t.textBody + "; position: relative; overflow: hidden; box-sizing: border-box; contain: layout paint; overflow-anchor: none; }" +
      ".card::before { content: ''; position: absolute; inset: 0; background: " + t.glow + "; pointer-events: none; }" +
      ".divider { height: 1px; background: " + t.divider + "; margin: 11px 0; }" +
      ".bar-w { height: 4px; background: " + t.barBg + "; border-radius: 2px; overflow: hidden; }" +
      ".bar-f { height: 100%; border-radius: 2px; transition: width 0.8s cubic-bezier(0.4,0,0.2,1); }" +
      ".mi { display: flex; flex-direction: column; gap: 3px; }" +
      ".ml { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: " + t.textMuted + "; }" +
      ".mv { font-size: 13px; color: " + t.textSub + "; }" +
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
    // Bigger LEVEL / VOLUME label — was 9px, now 11 (non-compact). Bold too
    // so the section header reads as a real label, not a whisper.
    const fsLabel = Math.round((compact ? 9 : 11) * scale) + "px";

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

    // Bottom row: Min / Max (toggle via show_minmax) and Pump (always visible
    // when entity_pump is set). If both are hidden we also drop the divider,
    // otherwise the card ends with an orphan line.
    const showMinMax = this._config.show_minmax !== false;
    const minMaxHtml = showMinMax
      ? "<div class='mi'><div class='ml'>Min</div><div class='mv'>" + uFmt(d.min, unit) + " " + ul + "</div></div>" +
        "<div class='mi'><div class='ml'>Max</div><div class='mv'>" + uFmt(d.max, unit) + " " + ul + "</div></div>"
      : "";
    const hasBottom = showMinMax || pumpHtml;
    const bottomRow = hasBottom
      ? "<div class='divider'></div>" +
        "<div style='display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;'>" +
          minMaxHtml +
          pumpHtml +
        "</div>"
      : "";

    return (
      "<div style='font-size:" + fsLabel + ";font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:" + t.textMuted + ";margin-bottom:4px;'>" + lbl + "</div>" +
      "<div style='font-size:" + fsBig + ";font-weight:700;color:" + col + ";line-height:1;letter-spacing:-.02em;text-shadow:0 0 20px " + glow + ";'>" +
        (level !== null ? uFmt(level, unit) : "—") +
        "<span style='font-size:" + fsSmall + ";color:" + t.textMuted + ";margin-left:2px;'>" + ul + "</span>" +
      "</div>" +
      "<div style='font-size:" + fsSmall + ";color:" + t.textSub + ";margin-top:" + (compact?"3px":"4px") + ";margin-bottom:" + (compact?"8px":"12px") + ";'>" +
        (level !== null ? Math.round(pct) + "% capacity" : "—") +
      "</div>" +
      "<div class='bar-w'><div class='bar-f' style='width:" + pct + "%;background:linear-gradient(90deg," + col + "88," + col + ");'></div></div>" +
      bottomRow
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

    // Fixed SVG slot: reserve the same vertical space regardless of the
    // style picked, so content below (readings, Min/Max, history) sits at a
    // predictable level. Shorter SVGs like tank-horizontal sit at the top
    // and get the extra space below.
    const svgBlock =
      "<div class='svg-wrap' style='flex-shrink:0;min-height:290px;display:flex;flex-direction:column;justify-content:center;align-items:center;'>" +
      this._renderSvg(d, t.shaft, "large") +
      "</div>";

    const readBlock =
      "<div style='flex:1;min-width:0;" + (isVertical ? "" : "padding-top:8px;") + "'>" +
      this._readings(d, t, false) +
      this._historyBlock(c.entity, t) +
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
      const wellEntity = (c.wells[idx] || {}).entity;
      const historyHtml = this._historyBlock(wellEntity, t);

      // Stacked: full-width row with large SVG on left, readings on right.
      // Side-by-side: compact column with small SVG on top + readings below.
      // In both layouts, the SVG wrapper has a fixed min-height matching the
      // tallest variant (290 large / 230 small). Shorter SVGs sit at the top
      // and leave empty space below, so the content after the SVG (readings,
      // history) lines up at the same vertical level across both wells —
      // otherwise mixing e.g. tank-horizontal with modern-dark gives one
      // column a readings row 100+ px higher than the other.
      const inner = stacked
        ? "<div style='display:flex;align-items:flex-start;gap:16px;'>" +
            "<div style='flex-shrink:0;min-height:290px;display:flex;flex-direction:column;justify-content:center;align-items:center;'>" + this._renderSvg(d, t.shaft, "large") + "</div>" +
            "<div style='flex:1;min-width:0;padding-top:8px;'>" + this._readings(d, t, false) + historyHtml + "</div>" +
          "</div>"
        : "<div style='display:flex;justify-content:center;align-items:center;min-height:230px;'>" + this._renderSvg(d, t.shaft, "small", idx) + "</div>" +
          "<div style='padding-top:8px;'>" + this._readings(d, t, true) + historyHtml + "</div>";

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
      ".ml{font-size:" + Math.round(9 * scale) + "px;} .mv{font-size:" + Math.round(12 * scale) + "px;}" +
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

  // Declare grid behaviour for the Sections view. Silences the "does not fully
  // support resizing" warning and gives HA sensible defaults + bounds. Rows
  // are "auto" so the card grows with its content (title, readings, history
  // chart) instead of getting clipped or padded.
  getGridOptions() {
    const c = this._config || {};
    const isDual = c.layout === "dual";
    return {
      columns:     isDual ? 12 : 6,
      rows:        "auto",
      min_columns: 3,
      min_rows:    2,
    };
  }

  // Older HA versions used getLayoutOptions() with grid_* keys. Kept for
  // back-compat — newer HA prefers getGridOptions() but honours either.
  getLayoutOptions() {
    const c = this._config || {};
    const isDual = c.layout === "dual";
    return {
      grid_columns:     isDual ? 12 : 6,
      grid_rows:        "auto",
      grid_min_columns: 3,
      grid_min_rows:    2,
    };
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
    // Smart rebuild: only re-create the DOM when something STRUCTURAL
    // changed (layout / dual ↔ single, theme custom-section toggle,
    // sensor_unit which repopulates display_unit dropdowns). For simple
    // value updates — like dragging the colour picker — we just push
    // values into the existing DOM via _applyValues. Without this, every
    // drag step caused HA to ping setConfig back, which used to rebuild
    // the whole editor and wipe the color picker mid-drag.
    const old = this._config;
    this._config = Object.assign({}, config);
    if (!this._built || this._needsStructuralRebuild(old, this._config)) {
      this._build();
    } else {
      this._applyValues();
    }
  }

  _needsStructuralRebuild(oldCfg, newCfg) {
    if (!oldCfg) return true;
    if (oldCfg.layout !== newCfg.layout) return true;
    // Custom-colours block appears/disappears with theme=custom.
    if ((oldCfg.theme === "custom") !== (newCfg.theme === "custom")) return true;
    // sensor_unit changes the display_unit dropdown's options.
    if (oldCfg.sensor_unit !== newCfg.sensor_unit) return true;
    if (newCfg.layout === "dual") {
      const a = oldCfg.wells || [], b = newCfg.wells || [];
      for (let i = 0; i < 2; i++) {
        if ((a[i] || {}).sensor_unit !== (b[i] || {}).sensor_unit) return true;
      }
    }
    return false;
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
          <label class="full"><span>Well style (override)</span>
            <select id="${p}well_style">
              ${opt("",               "Use card default")}
              ${opt("dark",           "Modern · dark")}
              ${opt("light",          "Modern · light")}
              ${opt("classic-pump",   "Classic · stone + hand pump")}
              ${opt("classic-roof",   "Classic · roof + bucket")}
              ${opt("classic-crank",  "Classic · wooden + crank")}
              ${opt("tank-cylinder",  "Tank · poly cylinder")}
              ${opt("tank-ibc",       "Tank · IBC tote")}
              ${opt("tank-barrel",    "Tank · wooden barrel")}
              ${opt("tank-horizontal","Tank · horizontal cylinder")}
            </select></label>
        </div>`;
    };

    // ── build HTML ──────────────────────────────────────────────────────────
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .ed {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px 18px;
          padding: 4px 0;
          font-family: var(--primary-font-family, sans-serif);
        }
        .full { grid-column: 1 / -1; }
        label { display: flex; flex-direction: column; gap: 6px; font-size: 14px; color: var(--secondary-text-color); }
        label span, .picker-label { font-weight: 600; font-size: 13px; color: var(--secondary-text-color); }
        input, select {
          padding: 10px 12px;
          border-radius: 6px;
          border: 1px solid var(--divider-color, #e0e0e0);
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color);
          font-size: 15px;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s;
        }
        input:focus, select:focus { border-color: var(--primary-color, #1e88e5); }
        select { cursor: pointer; }
        .sec {
          grid-column: 1 / -1;
          font-size: 12px; font-weight: 700;
          letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--primary-color, #1e88e5);
          border-top: 1px solid var(--divider-color, #e0e0e0);
          padding-top: 12px; margin-top: 4px;
        }
        .conv { grid-column: 1 / -1; font-size: 13px; color: var(--secondary-text-color); opacity: 0.7; margin-top: -4px; }
        .hint { grid-column: 1 / -1; font-size: 13px; color: var(--secondary-text-color); opacity: 0.7; border-top: 1px solid var(--divider-color, #e0e0e0); padding-top: 12px; line-height: 1.6; }
        .well-block { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; background: var(--secondary-background-color, rgba(0,0,0,.04)); border-radius: 8px; padding: 14px 16px; margin-top: 2px; }
        .wb-title { grid-column: 1 / -1; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--primary-color, #1e88e5); margin-bottom: 4px; }
        .picker-wrap { display: flex; flex-direction: column; gap: 6px; }
        ha-entity-picker { display: block; }
        .crow { display: flex; gap: 8px; align-items: center; }
        .crow input[type=text] { flex: 1; }
        .crow input[type=color] { width: 42px; height: 42px; border-radius: 5px; border: 1px solid var(--divider-color); padding: 2px; cursor: pointer; background: none; flex-shrink: 0; }
        label.cb { flex-direction: row; align-items: center; gap: 10px; cursor: pointer; }
        label.cb input[type=checkbox] { width: 18px; height: 18px; margin: 0; cursor: pointer; }
        label.cb span { font-size: 14px; font-weight: 600; color: var(--primary-text-color); }
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
            ${opt("",               "Auto (follow theme)")}
            ${opt("dark",           "Modern · dark")}
            ${opt("light",          "Modern · light")}
            ${opt("classic-pump",   "Classic · stone + hand pump")}
            ${opt("classic-roof",   "Classic · roof + bucket")}
            ${opt("classic-crank",  "Classic · wooden + crank")}
            ${opt("tank-cylinder",  "Tank · poly cylinder")}
            ${opt("tank-ibc",       "Tank · IBC tote")}
            ${opt("tank-barrel",    "Tank · wooden barrel")}
            ${opt("tank-horizontal","Tank · horizontal cylinder")}
          </select></label>
        <label><span>Font size</span>
          <select id="font_size">
            ${opt("small",  "Small")}
            ${opt("normal", "Normal (default)")}
            ${opt("large",  "Large")}
          </select></label>
        <label><span>Font family</span>
          <select id="font_family">
            ${opt("mono",  "Monospace (default)")}
            ${opt("ha",    "HA theme font")}
            ${opt("sans",  "Sans-serif")}
            ${opt("serif", "Serif")}
          </select></label>
        <label class="cb full"><input id="show_title" type="checkbox"><span>Show card title</span></label>
        <label class="cb full"><input id="show_minmax" type="checkbox"><span>Show Min / Max at the bottom</span></label>
        <label class="cb full"><input id="animate" type="checkbox"><span>Animate water (wavy surface)</span></label>
        <label><span>Wave intensity</span>
          <select id="wave_intensity">
            ${opt("calm",    "Calm")}
            ${opt("normal",  "Normal (default)")}
            ${opt("lively",  "Lively")}
            ${opt("choppy",  "Choppy")}
          </select></label>
        <label class="cb full"><input id="show_fish" type="checkbox"><span>Show fish 🐟 (just for fun)</span></label>
        <label class="cb full"><input id="show_history" type="checkbox"><span>Show history chart below each well</span></label>
        <label><span>History time range</span>
          <select id="history_hours">
            ${opt("1",   "1 hour")}
            ${opt("6",   "6 hours")}
            ${opt("12",  "12 hours")}
            ${opt("24",  "24 hours (default)")}
            ${opt("72",  "3 days")}
            ${opt("168", "7 days")}
            ${opt("720", "30 days")}
          </select></label>

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
    // font_family may be a preset key OR any raw CSS string. Only map to
    // the dropdown when it's a known preset; otherwise leave it empty and
    // the dropdown stays at default while the user's custom YAML value is
    // preserved in config (_bindEvents' onchange won't fire unless they
    // pick a preset).
    sv("font_family",      (["mono","ha","sans","serif"].includes(c.font_family) ? c.font_family : "mono"));
    // wave_intensity may be a preset name or a number; the dropdown only
    // knows the preset names, so fall back to "normal" for numeric values.
    sv("wave_intensity",   typeof c.wave_intensity === "string" ? c.wave_intensity : "normal");
    cb("show_title",       c.show_title);
    cb("show_minmax",      c.show_minmax);
    cb("animate",          c.animate);
    cb("show_fish",        !!c.show_fish);
    cb("show_history",     !!c.show_history);
    sv("history_hours",    String(c.history_hours || 24));

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
        sv(p + "well_style", w.well_style || "");
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
    ["name","theme","well_style","well_position","dual_arrangement","font_size","font_family","wave_intensity","history_hours",
     "sensor_unit","display_unit","min","max","warn_low","color",
     "card_background","card_border","text_color","title_color"
    ].forEach(f => onchange(f, f, null));

    // Checkbox fields use .checked instead of .value.
    const bindCb = (id, field) => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.addEventListener("change", () => this._set(field, el.checked));
    };
    bindCb("show_title",  "show_title");
    bindCb("show_minmax", "show_minmax");
    bindCb("animate",     "animate");
    bindCb("show_fish",   "show_fish");
    bindCb("show_history","show_history");

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
      ["name","sensor_unit","display_unit","min","max","warn_low","color","well_style"].forEach(f => {
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
    const nums = ["min","max","warn_low","history_hours"];
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
