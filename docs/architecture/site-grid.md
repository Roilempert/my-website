# Site shell grid

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
  columns: 18,
  rows: 10,
  padding: { value: 2.5, unit: 'rem' },  // ≈40px @ 16px root
  gap:       { value: 1.25, unit: 'rem' },
  debug: false,
  regions: { /* base rects — see table below */ },
  regionsByLevel: {
    2: { inspector: { colStart: 5, colEnd: 15, rowStart: 4, rowEnd: 8 } },
    3: { inspector: { colStart: 6, colEnd: 14, rowStart: 3, rowEnd: 8 } }
  }
}
```

- **columns / rows** — track counts for cell-size math.
- **padding / gap** — `{ value, unit }`; `rem` recommended.
- **regions** — grid-coordinate rectangles (`colEnd` / `rowEnd` exclusive). Derive `--site-layer-{name}-left/top/width/height`.
- **regionsByLevel** — partial overrides per depth level (merged over `regions` at runtime).
- **debug** — `true` draws column/row lines plus dashed region outlines (`#site-grid-debug-regions`).

Tokens are applied at boot and on every depth level change via `applySiteGridTokens()` (from `bootstrap.js` and `DepthController.syncViewLevelClass`).

## Content column scale (per depth level)

`contentColumns` sets how many **site shell columns** one content column is wide (a size reference). Total scrollable columns still come from `CONFIG.depth.v2.meso.colCount` (L2) and `micro.colCount` (L3).

| Level | `contentColumns` | Column width | Viewport reference |
|-------|------------------|--------------|-------------------|
| L1 macro | `1` | 1 site col | 18 slots |
| L2 meso | `3` | 3 site cols wide | ~6 cols visible in 18-col viewport |
| L3 micro | `6` | 6 site cols wide | ~3 cols visible in viewport |

Tokens: `--site-meso-col-width`, `--site-micro-col-width`, `--site-meso-viewport-cols` (reference only).

## Region map (current)

| Region key | UI | Element | Depth | Token usage |
|------------|-----|---------|-------|-------------|
| `nav` | Pan / edge-scroll | `#nav-surface` | All | Full viewport (reference) |
| `canvas` | Main exploration | `#app` | All | `--scroll-breathing-room`, `--site-canvas-page-padding-x` |
| `warehouse` | ACTION REPOSITORY | `.warehouse-shell` | All | Default dock `left` / `width` |
| `blockBar` | Deployed blocks strip | `.depth-block-bar` | L2/L3 | Fixed `left` / `width` / `top` when visible |
| `inspector` | Focus note card | `.artifact-inspector-panel` | All (L2/L3 overrides) | Panel position and size |
| `filterFringe` | Filtered notes edge strip | `#filter-fringe-zone` | L2/L3 | `--v2-fringe-width`, top / max-height |
| `resetButton` | Warehouse RESET (×) | `.warehouse-reset` | All | Fixed anchor when workspace active |

**Deferred:** deployed surface blocks, link canvas, hover ID badge, workspace void, film grain.

## CSS tokens

| Token | Meaning |
|-------|---------|
| `--site-grid-padding`, `--site-grid-gap` | Outer inset and inter-cell gap |
| `--site-grid-cell-w`, `--site-grid-cell-h` | One cell in the content area |
| `--site-layer-{name}-left/top/width/height` | Region rect per `regions` entry |
| `--scroll-breathing-room` | Set to `var(--site-layer-canvas-top)` when `canvas` region exists |
| `--site-canvas-page-padding-x` | Set to `var(--site-grid-padding)` for L2/L3 page inset |

## DOM labels

`data-site-layer` marks elements for documentation and future hooks — not grid placement.

## Tuning workflow

1. Set `debug: true` in `config.js`, refresh.
2. Adjust `regions` col/row spans until dashed outlines match intent.
3. Add `regionsByLevel` entries only where L1/L2/L3 should differ.

## What stays untouched

- `#app` internal grids, physics, workspace secondary grid — see [`docs/CHECKPOINT.md`](../CHECKPOINT.md).
- Block drag, pan, scroll clamp logic.
