# Well Water Level Card

A Home Assistant Lovelace card that visualises a water-level (or volume) sensor as an animated well shaft. Single- or dual-tank layout, four themes, automatic unit conversion between `m / cm / mm / m³ / l`, optional pump indicator, and a full visual editor.

![card](./well-water-card-preview.html)

## Features

- **Single or dual well** layout, with side-by-side or stacked arrangement for dual.
- **Themes**: dark, light, follow-HA, or fully custom colors.
- **Flexible well position** for single mode: left, right, top, bottom.
- **Unit conversion**: sensor reports in any depth/volume unit, card displays in any compatible unit.
- **Warning threshold** with amber styling below a configurable level.
- **Optional pump entity** — shows a pulsing indicator when running.
- **Custom water color** per well (overrides the default blue for the "ok" state).
- **Font size** presets (small / normal / large).
- **Hideable card title**.
- **Responsive**: side-by-side layouts collapse to stacked on narrow cards.
- **Visual editor** with entity pickers, live preview, and color wheels.

## Install via HACS (custom repository)

1. In HACS, open the three-dot menu → **Custom repositories**.
2. Paste `https://github.com/Thoky81/ha-well-water-card` and pick type **Dashboard** (this is HACS's category for Lovelace frontend cards). Click **Add**.
3. Find **Well Water Level Card** in HACS, click **Download**.
4. Reload Lovelace (HACS usually adds the resource automatically). If it did not, add one manually:
   - Settings → Dashboards → Resources → **Add**
   - URL: `/hacsfiles/ha-well-water-card/well-water-card.js`
   - Type: **JavaScript module**
5. Hard-refresh your browser (Ctrl/Cmd + Shift + R).

## Manual install

1. Copy `well-water-card.js` to `/config/www/`.
2. Add the resource in Settings → Dashboards → Resources:
   - URL: `/local/well-water-card.js?v=21`
   - Type: **JavaScript module**
3. Hard-refresh the browser. Bump the `?v=` number whenever you update the file.

## Add the card

In the dashboard editor click **Add card → Custom: Well Water Level Card**, or paste YAML:

```yaml
type: custom:well-water-card
entity: sensor.well_water_level
name: Well
sensor_unit: cm
display_unit: m
min: 0
max: 4
warn_low: 1.0
entity_pump: binary_sensor.well_pump
theme: dark
well_position: left
```

### Dual-tank example

```yaml
type: custom:well-water-card
layout: dual
name: Water Tanks
theme: ha
dual_arrangement: side_by_side     # or: stacked
wells:
  - entity: sensor.well_1
    name: Well
    sensor_unit: m
    display_unit: m
    min: 0
    max: 4
    warn_low: 1.0
    entity_pump: binary_sensor.pump_1
  - entity: sensor.tank_1
    name: Tank
    sensor_unit: l
    display_unit: l
    min: 0
    max: 2000
    warn_low: 400
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `entity` | string | — | Water-level sensor entity (required in single mode). |
| `entity_pump` | string | — | Optional `binary_sensor` for the pump. |
| `name` | string | `Well` | Card title. |
| `sensor_unit` | `m`\|`cm`\|`mm`\|`m3`\|`l` | auto-detected from the entity's `unit_of_measurement`, falling back to `m` | Unit the sensor reports. Usually you don't need to set this — the visual editor auto-fills it when you pick the entity, and the card reads it from the entity at runtime if omitted. |
| `display_unit` | same set | = `sensor_unit` | Unit to display. Auto-converts. |
| `min` / `max` | number | `0` / `4` (depth) or `1000` (volume) | Range in `display_unit`. |
| `warn_low` | number | — | Amber warning threshold in `display_unit`. |
| `color` | hex string | — | Water tint for the "ok" state (warn/empty/full still override). Per-well in dual mode. |
| `font_size` | `small`\|`normal`\|`large` | `normal` | Scales the readings text proportionally. |
| `show_title` | boolean | `true` | Set `false` to hide the card title. |
| `show_minmax` | boolean | `true` | Set `false` to hide the Min / Max row at the bottom of the readings block. |
| `animate` | boolean | `true` | Set `false` for a flat water surface (no wave animation). Also pauses fish. |
| `wave_intensity` | `calm`\|`normal`\|`lively`\|`choppy` (or a number 0..2) | `normal` | Scales wave amplitude. YAML users can set a raw number for finer control. |
| `show_fish` | boolean | `false` | Set `true` to add a couple of fish swimming back and forth inside the water. |
| `show_history` | boolean | `false` | Set `true` to show a history sparkline below each well. Fetched from HA's recorder, refreshed every ~5 minutes. |
| `history_hours` | number | `24` | Time range for the history chart. Common values: `1`, `6`, `12`, `24`, `72`, `168`, `720`. |
| `theme` | `dark`\|`light`\|`ha`\|`custom` | `dark` | Card theme. |
| `well_style` | `dark` \| `light` \| `classic-pump` \| `classic-roof` \| `classic-crank` \| `tank-cylinder` \| `tank-ibc` \| `tank-barrel` \| `tank-horizontal` | follows theme | Illustration / shaft look. `dark` / `light` are the modern cross-section; `classic-*` add period decoration (hand pump, roof + bucket, wooden drum + crank); `tank-*` show water-tank bodies (poly cylinder, IBC tote, wooden barrel, horizontal pressure cylinder). |
| `well_position` | `left`\|`right`\|`top`\|`bottom` | `left` | Layout of SVG vs readings (single only). |
| `layout` | `single`\|`dual` | `single` | Number of wells. |
| `dual_arrangement` | `side_by_side`\|`stacked` | `side_by_side` | Dual layout. |
| `wells` | list | — | Per-well config in dual mode (same options as single, minus layout/theme). Each well may also set its own `well_style` to override the card-wide one. |
| `card_background` / `card_border` / `text_color` / `title_color` | hex string | — | Only applied when `theme: custom`. |

## Units

- Depth units: `m`, `cm`, `mm` — mutually convertible.
- Volume units: `m3` (m³), `l` — mutually convertible.
- The card will not convert between depth and volume; pick the right `sensor_unit` / `display_unit` pair.

## Troubleshooting

- **Visual editor changes don't reflect**: hard-refresh the browser (Ctrl/Cmd + Shift + R). HA caches JS resources; the `?v=` parameter in the resource URL helps if you're doing manual installs.
- **"entity is required"**: set the `entity:` field. From v7 the card shows a friendly placeholder instead of an error while you configure it.

## License

MIT.
