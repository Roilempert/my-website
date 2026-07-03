# Visual language — exhibition design legend

**Living document.** Update whenever colors, typography, spacing, grid marks, SVG chrome, or component styling changes. Agents: see `.cursor/rules/visual-language.mdc`.

**Status:** Spec locked (2026-07-03). **Code:** exhibition redesign implemented in `styles.css`, `js/config.js`, warehouse, navigation, inspector, L3 cards. **Deferred:** L2 `SilhouetteEngine` (MesoMock interim), physics tuning at `VISUAL_SCALE 1.0`.

**Hardware target:** 21.5″ iMac, **1920×1080** fullscreen (`AGENTS.md`, `EXHIBITION-START-HERE.txt`).

**Design source:** [Figma PAGMAR Page 2](https://www.figma.com/design/8VKrVeaCkBqSlSlUABVH5E/PAGMAR) + user spec.

---

## Global rules

| Rule | Meaning |
|------|---------|
| `*` | **No Figma placeholder note text** in code — titles, bodies, blocks, tags from live sheet / CSV only |
| `**` | **No raw px in final CSS** — use `rem` (16px root) or `calc(N * var(--site-grid-cell-w))` for exhibition-accurate size |
| `***` | **`VISUAL_SCALE = 1.0`** in `js/config.js` — shell/chrome sizes at full spec on exhibition iMac, not 0.72 shrink |

---

## Color palette

CSS tokens in `:root` (`styles.css`):

| Token | Hex | Role |
|-------|-----|------|
| `--color-1` | `#FFFFFF` | Note card background, block text, tag fill |
| `--color-2` | `#898989` | L1 cross marks, L2 diagonal grid marks |
| `--color-3` | `#2D2D2D` | Action blocks, L3 grid dots, map objects, metadata panel, related-notes section title, SVG chrome |
| `--color-4` | `#000000` | Note text, tag border/text, metadata text, **1pt note borders** |
| `--color-5` | `#F2F0EE` | Canvas / note field background |
| `--color-6` | `#EDE8E2` | Warehouse + map panel bg, layer nav label boxes, clear control (`נקה לוח`) |

**Divider inset:** `--divider-inset: 1.25rem` (20px) — gap between divider line ends and panel outer border (site-wide).

---

## Typography

Four classes replace legacy `--type-*` / ratzif22 / NarkissTam body.

| Class | Font file | Size | Line | Other | Use |
|-------|-----------|------|------|-------|-----|
| `.general-h` | `NarkissYair-Bold-TRIAL.woff2` | 66pt | 56pt | — | Inactive layer labels; inspector ID title; related-notes section title |
| `.general-t` | `NarkissYair-BoldMono-TRIAL.woff2` | 20pt | 20pt | — | Warehouse, blocks, **active** layer label, metadata labels/details, note ID |
| `.note-h` | `Neoklass-BoldItalic-TRIAL.woff2` | 86pt | 90% | letter-spacing −1% | Note titles |
| `.note-t` | `FrankRuhl_Universal-Mono.woff2` | 18pt | 120% | — | Note body |

**Retired for exhibition UI:** `ratzif22`, NarkissTam on note body, NarkissYair Regular for chrome.

---

## Layout — site shell grid

| Property | Value |
|----------|--------|
| Grid | **18 columns × 10 rows** (`CONFIG.siteGrid`) |
| Viewport padding | **20px** → `1.25rem` (all sides) |
| Grid marks | At **every** row/column crossing |

### Grid marks by depth level

| Level | Mark | Size | Color |
|-------|------|------|-------|
| L1 macro | Cross (+) | 10×10 | color 2 |
| L2 meso | Diagonal 45° | 10px length | color 2 |
| L3 micro | Dot | 5px | color 3 |

**Do not add:** L2 extra fringe glyph, focus connector from old Figma audit.

---

## Components

### Warehouse (rows 9–10)

- **Shell:** 2 rows high, cols 1–18 inside padding; **4 corner decorations** on outer shell (5×5, color 3, static).
- **Action dock** (15 cols): bg color 6, radius 5px, **right side** of the shell.
  - Statistics (2×3): block counter only
  - Message port (0.5×12): `גררו להפעלה` (`.general-t`)
  - Block panel (1.5×12): live blocks from sheet (`.general-t`)
- **Map** (3 cols): bg color 6, radius 5px, **left side** of the shell; live minimap (objects color 3).
- **Panel dividers:** color 3 hairlines with `--divider-inset` top/bottom breathing room.
  - between statistics and dock content
  - above the block tray / under the message port
  - between dock and map
- **Viewport marker:** **fixed** at center of map frame — does **not** move; map **content** pans behind it, clipped to panel bounds.
- **Remove:** English `ACTION REPOSITORY` label.

### Action blocks (dock panel)

| Property | Value |
|----------|--------|
| Gap | 60px → `3.75rem` |
| Border | none |
| Fill | color 3 |
| Text | color 1, `.general-t` |
| Tag dot | color from sheet |

### Deployed block

- **20px** above dock top, **10px** inset from dock right edge
- Clear: **`נקה לוח`**, fill color 6 (= RESET)
- Counter in statistics panel only

### Layer navigation (right)

| State | Box | Type | Marker |
|-------|-----|------|--------|
| Active | color 6, 5px pad, 5px radius | `.general-t` | selection vector SVG |
| Inactive | same box styling | `.general-h` | none |

- **10px** gap between three boxes
- **40px** from viewport right edge → `2.5rem`
- Active label vertically centered; slot animation moves inactive labels
- **Selection marker:** one SVG, reparented to active button in `syncActiveState()` — rides existing slot transition

### L3 note cards

| Property | Value |
|----------|--------|
| Column gap | 40px → `2.5rem` |
| Min height | 6 site rows |
| Card bg / text | color 1 / color 4 |
| Border | **1pt solid color 4** (all note surfaces: grid, focus, related) |
| Title / body | `.note-h` / `.note-t` |

**Tags (below card):** 15px below note; 10px between tags; pill fill color 1, 1pt border color 4, text color 4 (not dock block styling).

### Focus popup (inspector, all levels)

- Backdrop: color 3 @ 20% opacity
- Note scales **6 cols → 8 cols** proportionally
- Metadata panel below (40px gap): bg color 3, text color 4, radius 5px
- **Related notes:** one section per tag subset of focus note that **exists on at least one other note**; omit unused combinations; 2 notes per row, 40px gap

---

## SVG assets

Export from Figma as **one grouped SVG per decoration** (not shape-by-shape). Save under `assets/ui/`.

**Naming:** `decoration-corner-{tl|tr|bl|br}.svg` for corner marks (orientation = how the path sits in the SVG viewBox). Reuse one file at multiple corners via CSS flip/rotate.

| File | Figma source | In code | Motion |
|------|--------------|---------|--------|
| `layer-nav-marker.svg` | `layer navigation final` (638:12) | `navigation-map.js` | Moves with active layer button |
| `decoration-corner-tr.svg` | One shell corner group (exported **top-right** orientation) | `.warehouse-shell` × 4 (mirror/rotate per corner) | Static |
| — | — | Map viewport marker | **Not SVG** — fixed DOM/canvas frame; map pans behind |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-03 | Warehouse shell fixed: dock on right, map on left, divider lines restored |
| 2026-07-03 | Exhibition redesign implemented: tokens, warehouse dock/map, layer nav, L3 cards, inspector popup |
| 2026-07-03 | SVG assets added: `layer-nav-marker.svg`, `decoration-corner-tr.svg` |
