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
| `**` | **No raw px in final CSS for spacing** — translate Figma px to `--space-*` tokens, or use site-grid units for layout |
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

**Divider inset:** `--divider-inset: var(--space-20)` (20px) — gap between divider line ends and panel outer border (site-wide).

---

## Spacing

Design spacing may be specified in Figma `px`, usually in 5px jumps. Agents must translate those values to CSS spacing tokens before editing final CSS.

| Figma value | CSS token |
|-------------|-----------|
| 5px | `var(--space-5)` |
| 10px | `var(--space-10)` |
| 15px | `var(--space-15)` |
| 20px | `var(--space-20)` |
| 30px | `var(--space-30)` |
| 40px | `var(--space-40)` |
| 60px | `var(--space-60)` |

Use `--space-*` for component gaps, padding, insets, margins, and radii that come from Figma spacing. Use `--site-grid-*` or `calc(N * var(--site-grid-cell-w))` for shell layout tied to the 18×10 grid. Raw `px` remains acceptable for hairlines, borders, physics/canvas coordinates, SVG primitives, and tiny debug-only values.

---

## Typography

Four classes replace legacy `--type-*` / ratzif22 / NarkissTam body.

| Class | Font file | Size | Line | Other | Use |
|-------|-----------|------|------|-------|-----|
| `.general-h` | `NarkissYair-Bold-TRIAL.woff2` | `4.125rem` | `3.5rem` | — | Inactive layer labels; inspector ID title; related-notes section title |
| `.general-t` | `NarkissYair-BoldMono-TRIAL.woff2` | `1rem` | `1` | no synthesis | Warehouse, blocks, **active** layer label, metadata labels/details, note ID |
| `.note-h` | `Neoklass-BoldItalic-TRIAL.woff2` | `5.375rem` | `0.9` | letter-spacing −1% | Note titles |
| `.note-t` | `FrankRuhl_Universal-Mono.woff2` | `1.125rem` | `1.2` | — | Note body |

**Retired for exhibition UI:** `ratzif22`, NarkissTam on note body, NarkissYair Regular for chrome.

---

## Layout — site shell grid

| Property | Value |
|----------|--------|
| Grid | **18 columns × 10 rows** (`CONFIG.siteGrid`) |
| Viewport padding | **20px** → `1.25rem` (all sides) |
| Grid marks | Every second row/column crossing |

### Grid marks by depth level

| Level | Mark | Size | Color |
|-------|------|------|-------|
| L1 macro | Cross (+), behind macro molecule backing | 10×10 | color 2 |
| L2 meso | Diagonal 45° | 10px length | color 2 |
| L3 micro | Dot | 5px | color 3 |

**Do not add:** L2 extra fringe glyph, focus connector from old Figma audit.

---

## Components

### Warehouse (rows 9–10)

- **Shell:** 2 rows high, cols 1–18 inside padding; transparent outer wrapper with **4 corner decorations** (5×5, color 3, static).
- **Action dock** (15 cols): separate bg color 6 panel, radius 5px, **left side** of the shell.
  - Inner corner decorations: two marks on the dock right edge, paired with two marks on the map left edge around the dock/map gap
  - Message/statistics inset: top/right 10px → `var(--space-10)`; left/bottom 20px → `var(--space-20)`; paragraph indent 20px → `var(--space-20)`
  - Statistics (2×3): block counter only, top-aligned on left side of dock
  - Message port (0.5×12): `גררו להפעלה` (`.general-t`), middle area next to map; text top-aligned; no extra outer side inset beyond internal padding
  - Block panel (1.5×12): live blocks from sheet (`.general-t`), middle area next to map; content padding is 10px → `var(--space-10)`, including 10px below the separator hairline
- **Map** (3 cols): separate bg color 6 panel, radius 5px, **right side** of the shell; live minimap with compact details (objects color 3).
- **Dock/map gap:** one site-grid gap between the action dock panel and map panel.
- **Panel dividers:** color 3 hairlines with 5px → `var(--space-5)` endpoint breathing room.
  - between statistics and dock content: vertical divider ends 5px from dock top/bottom
  - above the block tray / under the message port: horizontal divider starts at the statistics divider and ends 5px from the dock right edge, creating a joined rotated T shape
- **Viewport marker:** compact, **fixed** at center of map frame — does **not** move; map **content** pans behind it, clipped to panel bounds. Marker proportions follow the raw browser viewport; L1 uses live macro dots, and L2 uses stable meso frame rectangles with original line silhouettes drawn inside them.
- **Remove:** English `ACTION REPOSITORY` label.

### Action blocks (dock panel)

All block/tag pills use the same dimensions everywhere on the site; only color roles change by context.

| Property | Value |
|----------|--------|
| Horizontal gap | 10px → `var(--space-10)` |
| Vertical gap | 10px → `0.625rem` |
| Horizontal padding | 10px → `var(--space-10)` |
| Border | none |
| Fill | color 3 |
| Text | color 1, `.general-t` |
| Tag dot | 10px, color from sheet |
| Dot/text gap | 10px → `var(--space-10)` |

### Deployed block

- **20px** above dock top, **10px** inset from dock right edge
- Clear: **`נקה לוח`**, fill color 6 (= RESET)
- Counter in statistics panel only

### Layer navigation (right)

| State | Box | Type | Marker |
|-------|-----|------|--------|
| Active | color 6, 5px pad, 5px radius | `.general-h` | selection vector SVG |
| Inactive | same box styling | `.general-t` | none |

- **5px** gap between three boxes
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

**Tags (below card):** same sizing as action dock blocks: 26px pill height, 10px horizontal padding, 10px dot, 10px dot/text gap, 10px between tags; pill fill color 1, 1pt border color 4, text color 4.

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
| 2026-07-04 | Reduced layer navigation label padding and inter-label gap to 5px using `var(--space-5)` |
| 2026-07-04 | Switched layer navigation type hierarchy so the active layer is large and inactive layers are small; restored color-6 rectangular boxes with 10px padding |
| 2026-07-04 | Added original L2 line silhouettes inside stable minimap frame markers after saving the successful frame-echo reference |
| 2026-07-04 | Expanded shared block/tag pill dot-text gap to 10px using `var(--space-10)` |
| 2026-07-04 | Reduced L1/L2/L3 site-grid marks to every second row/column crossing |
| 2026-07-04 | Added inner decorative corner marks at the action dock/map gap |
| 2026-07-04 | Restored L2 minimap viewport echo with frame rectangles while keeping detailed fragments disabled |
| 2026-07-04 | Rolled L2 minimap back to stable frame rectangles after detailed silhouette fragments caused missing/stacked markers |
| 2026-07-04 | Set message/statistics paragraph indent to 20px using `var(--space-20)` |
| 2026-07-04 | Reduced message/statistics paragraph indent to 30px using `var(--space-30)` |
| 2026-07-04 | Increased message/statistics paragraph indent to 40px using `var(--space-40)` |
| 2026-07-04 | Set message/statistics right padding to 10px and added 20px paragraph indent |
| 2026-07-04 | Moved warehouse divider endpoints to 5px and joined the message/block divider to the statistics divider |
| 2026-07-04 | Removed message panel outer side inset so the 20px internal padding is not doubled |
| 2026-07-04 | Reduced message/statistics top padding to 10px while keeping side/bottom inset at 20px |
| 2026-07-04 | Set message/statistics panel padding to 20px and block-panel padding to 10px using spacing tokens |
| 2026-07-04 | Matched message and statistics panel top/side inset to 5px and top-aligned message text |
| 2026-07-04 | Corrected warehouse left-side decorative corner orientations from the top-right SVG asset |
| 2026-07-04 | Set action dock block-panel content padding to 5px, including the gap below the separator hairline |
| 2026-07-04 | Aligned action dock block-panel padding to the message port/divider inset and 5px message spacing |
| 2026-07-03 | Locked block/tag pill sizing invariant: same dimensions everywhere, color only changes by context |
| 2026-07-03 | L2 minimap switched from note centers to visible meso frame/silhouette rectangles for canvas alignment |
| 2026-07-03 | Matched action/L3 tag pill sizing to L1 molecule dots and tightened dock tray horizontal gap |
| 2026-07-03 | L1 minimap switched from note centers to live macro dots for denser viewport-marker alignment |
| 2026-07-03 | Reduced `.general-t` from 20px to responsive `1rem` and converted typography spec away from `pt` units |
| 2026-07-03 | Restored L1 molecule dots above macro canvas backing |
| 2026-07-03 | Minimap viewport marker updated to track the raw browser viewport for row alignment |
| 2026-07-03 | Added 5px text inset token for action dock text areas |
| 2026-07-03 | L1 grid crosses moved behind an opaque macro molecule backing, matching L2/L3 depth behavior |
| 2026-07-03 | Removed L1 molecule hover ID badge; hover remains visual/click feedback only |
| 2026-07-03 | Warehouse statistics moved to top of left panel |
| 2026-07-03 | Map panel details and fixed viewport marker reduced for quieter warehouse chrome |
| 2026-07-03 | Message port height aligned to half a site-shell row |
| 2026-07-03 | Unified `.general-t` / NarkissYair mono bold rendering and disabled font synthesis |
| 2026-07-03 | Added Figma px to CSS `--space-*` spacing-token translation rule |
| 2026-07-03 | Action block text reset: no stroke, shadow, paint-order changes, or font synthesis |
| 2026-07-03 | Warehouse block tray gaps tightened to 15px horizontal / 10px vertical |
| 2026-07-03 | Warehouse split into separate action dock and map panels with site-grid gap |
| 2026-07-03 | Warehouse message/block divider moved between message row and block tray |
| 2026-07-03 | Enforced `.general-t` class on warehouse/action blocks |
| 2026-07-03 | Warehouse block tray fixed: 60px horizontal gap, compact vertical row gap |
| 2026-07-03 | Warehouse dock internals fixed: statistics left, block panel/message middle |
| 2026-07-03 | Warehouse shell fixed: dock on left, map on right, divider lines restored |
| 2026-07-03 | Exhibition redesign implemented: tokens, warehouse dock/map, layer nav, L3 cards, inspector popup |
| 2026-07-03 | SVG assets added: `layer-nav-marker.svg`, `decoration-corner-tr.svg` |
