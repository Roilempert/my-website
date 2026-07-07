# Site shell grid

**Canonical layout reference: 24 columns × 12 rows** (`CONFIG.siteGrid.columns` / `.rows`). Documented in `AGENTS.md` as the project shell standard.

Viewport-level **reference grid** for proportions, spacing, and default anchors. Separate from the **canvas grids** inside `#app` (physics macro grid, catalog layout, depth V2 meso/micro grids).

Layers are **not** locked into grid cells. The canvas scrolls wider than the viewport, blocks drag freely, and pan stays full-screen. The shell grid supplies measurable tokens (`--site-grid-cell-w/h`, `--site-layer-*`) that UI can scale against.

## Model

```mermaid
flowchart LR
  Config["CONFIG.siteGrid.regions"]
  Tokens[":root CSS tokens"]
  UI["UI parts consume tokens"]
  Config --> Tokens --> UI
  UI -->|"overflow / drag / scroll"| Free["Unconstrained motion"]
```

## Two grids

| Grid | Scope | Config | Purpose |
|------|-------|--------|---------|
| **Site shell** | Viewport reference (`:root` tokens) | `CONFIG.siteGrid` | Padding, gap, cell size, region anchors |
| **Canvas** | `#app` — scrollable workspace | `CONFIG.depth.*`, `--col-count` | Notes, dots, silhouettes, physics |

Do not change `#app` column counts or canvas width when adjusting the site shell.

## Configuration

Edit `CONFIG.siteGrid` in [`js/config.js`](../../js/config.js):

```js
siteGrid: {
  columns: 24,
  rows: 12,
  padding: { value: 1.25, unit: 'rem' },  // 20px @ 16px root
  gap:       { value: 1.25, unit: 'rem' },
  crossStep: 3,
  debug: false,
  regions: { /* base rects — see table below */ },
  regionsByLevel: {
    2: { inspector: { colStart: 7, colEnd: 21, rowStart: 5, rowEnd: 10 } },
    3: { inspector: { colStart: 8, colEnd: 19, rowStart: 4, rowEnd: 10 } }
  },
  contentColumns: { 1: 1, 2: 4, 3: 6 },
  microNoteMinRows: 6
}
```

- **columns / rows** — track counts for cell-size math.
- **padding / gap** — `{ value, unit }`; `rem` recommended.
- **crossStep** — grid mark density (every Nth row/column intersection).
- **regions** — grid-coordinate rectangles (`colEnd` / `rowEnd` exclusive). Derive `--site-layer-{name}-left/top/width/height`.
- **regionsByLevel** — partial overrides per depth level (merged over `regions` at runtime).
- **debug** — `true` draws column/row lines plus dashed region outlines (`#site-grid-debug-regions`).

Tokens are applied at boot and on every depth level change via `applySiteGridTokens()` (from `bootstrap.js` and `DepthController.syncViewLevelClass`).

## Content column scale (per depth level)

`contentColumns` sets how many **site shell columns** one content column is wide (a size reference). Total scrollable columns come from `CONFIG.depth.v2.micro.colCount` (L2 micro). Legacy meso col count remains in config for art paths only.

| Level | `contentColumns` | Column width | Viewport reference |
|-------|------------------|--------------|-------------------|
| L1 macro | `1` | 1 site col | 24 slots |
| L2 micro | `6` | 6 site cols wide | ~4 cols visible in viewport |

Legacy meso used `contentColumns[2] = 4` — not navigable.

Tokens: `--site-meso-col-width`, `--site-micro-col-width`, `--site-meso-viewport-cols` (reference only).

## Region map (current)

| Region key | UI | Element | Depth | Grid span (24×12) |
|------------|-----|---------|-------|---------------------|
| `nav` | Pan / edge-scroll | `#nav-surface` | All | Full viewport |
| `canvas` | Main exploration | `#app` | All | rows 1–10 — `--scroll-breathing-room`, `--site-canvas-page-padding-x` |
| `warehouse` | ACTION REPOSITORY | `.warehouse-shell` | All | rows 11–12 (2 rows) |
| `warehouseDock` | Action dock | `.warehouse-dock` | All | cols 1–20, rows 11–12 |
| `warehouseMessageBand` | Message row (hover + system) | `.warehouse-message-band` | All | cols 5–20, row 11 (top half of dock) |
| `warehouseMap` | Minimap panel | `.warehouse-map` | All | cols 21–24, rows 11–12 |
| `blockBar` | Deployed blocks strip | `.depth-block-bar` | L2 | cols 1–20, row 10 |
| `inspector` | Focus note card | `.artifact-inspector-panel` | All (L2 overrides) | See `regionsByLevel` |
| `filterFringe` | Filtered notes edge strip | `#filter-fringe-zone` | L2 | cols 23–24, rows 1–10 |
| `navigationLayers` | Depth layer titles | `#site-navigation-layers` | All | cols 23–24, rows 1–6 |
| `navigationMaps` | Active-layer minimap | `#site-navigation-maps` | All | cols 21–24, rows 11–12 (4×2 cells) |
| `resetButton` | Warehouse RESET (×) | `.warehouse-reset` | All | Fixed anchor when workspace active |

**Deferred:** deployed surface blocks, link canvas, hover ID badge, workspace void, film grain.

## CSS tokens

| Token | Meaning |
|-------|---------|
| `--site-grid-padding`, `--site-grid-gap` | Outer inset and inter-cell gap |
| `--site-grid-cell-w`, `--site-grid-cell-h` | One cell in the content area |
| `--site-layer-{name}-left/top/width/height` | Region rect per `regions` entry |
| `--scroll-breathing-room` | Set to `var(--site-layer-canvas-top)` when `canvas` region exists |
| `--site-l1-bottom-chrome` | L1 only — `calc(100vh - var(--site-layer-warehouse-top))`; canvas padding + scroll clamp |
| `--site-canvas-page-padding-x` | Set to `var(--site-grid-padding)` for L2 page inset |

## DOM labels

`data-site-layer` marks elements for documentation and future hooks — not grid placement.

## Tuning workflow

1. Set `debug: true` in `config.js`, refresh.
2. Adjust `regions` col/row spans until dashed outlines match intent.
3. Add `regionsByLevel` entries only where L1/L2 should differ.

## What stays untouched

- `#app` internal grids, physics, workspace secondary grid — see [`docs/CHECKPOINT.md`](../CHECKPOINT.md).
- Block drag, pan, scroll clamp logic (`CONFIG.navigation.contentPadding` stays ~120px).
