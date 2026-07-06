# Depth V2 — L3 micro (active)

Two **navigable** depth levels: **L1 macro** (physics dots) and **L3 micro** (full notes grid). **L2 meso** (silhouettes / MesoMock) removed from navigation (2026-07-05); `SilhouetteEngine` kept for opening-screen art only.

## Current state

```
CONFIG.depth.depthEngine: 'v2'
```

The legacy engine (catalog, complex transitions) is **frozen** — code remains in the project but is inactive in this mode.

Code file:

```
js/depth-v2.js
```

## Site shell vs canvas grids

| Grid | Scope | Canonical size |
|------|-------|----------------|
| **Site shell** | Viewport reference — padding, UI anchors, proportional tokens | **24 columns × 12 rows** (`CONFIG.siteGrid`) — see [`site-grid.md`](site-grid.md) |
| **Canvas (L2/L3)** | Scrollable `#app` workspace — note layout at meso/micro | `CONFIG.depth.v2.meso` / `.micro` (wider than viewport) |

Do not change canvas column counts when adjusting the 24×12 shell.

## Work phases

| Phase | Status | Description |
|-----|--------|--------|
| 1 | **active** | Separate L2/L3 canvas grids + **interim** L2 placeholder (`MesoMock` gradients) |
| 2 | pending | Layer transitions (scroll → FX → reveal) |
| 3 | **target** | **Typographic silhouettes** at L2 via `SilhouetteEngine` (project goal in `AGENTS.md`); same path geometry also feeds **opening-screen silhouette art** — see [`experience-model.md`](experience-model.md) |

MesoMock is a **stand-in**, not the intended exhibition look. Phase 3 replaces gradient mocks with measured title/body silhouettes.

## Canvas grids (current `config.js`)

| Layer | Canvas width | Columns | Notes |
|------|-------------|---------|--------|
| L2 meso | `175vw` | 9 | ~5–6 cols in viewport; rest scrolls off-screen (stable 2026-06-22) |
| L3 micro | (viewport-driven) | 12 | `viewportCols: 3` in frame |

Values in:

```
CONFIG.depth.v2.meso
CONFIG.depth.v2.micro
```

## Interim L2 placeholder (MesoMock)

Until Phase 3, V2 L2 shows a **gradient mock** — not `SilhouetteEngine`:

```
js/meso-mock.js
js/meso-gradient-p5.js      // mockGradientMode: p5 (baseline — meso-gradient-p5-baseline.md)
js/meso-gradient-engine.js  // mockGradientMode: shader
```

- Deterministic profile by ID (rows, width, span)
- **Default (2026-06-21):** `p5` — mandala morph, texture bake cache
- Alternatives: `shader`, canvas, blobs, bands, svg

### Fill modes

| Mode | Description |
|-----|--------|
| p5 | mandala smin + tag rings + seams; baseline: `meso-gradient-p5-baseline.md` |
| shader | WebGL + simplex FBM + grain; tags → 3 colors |
| canvas | 2D bake, cache |
| blobs | radial in CSS — fallback |
| bands | linear by tags |
| svg | old — not default |

### Shader keys

```
CONFIG.depth.v2.meso.mockGradientMode
CONFIG.depth.v2.meso.mockShaderGrain
CONFIG.depth.v2.meso.mockShaderAnimSpeed
CONFIG.depth.v2.meso.mockShaderLiveHover
CONFIG.depth.v2.meso.mockShaderBgColor
CONFIG.depth.v2.meso.mockCanvasScale
CONFIG.depth.v2.meso.mockColorEnrich
```

Grid preparation clears texture bake cache.

### Manual check (layer 2)

1. Silhouettes visible, right-aligned, no white rectangle, no grid overlap
2. Note with multiple tags — rich color collision
3. Note with one tag — dark base layer and strong blob
4. L1→L2 twice — cache (no significant flash)
5. Switch mode to blobs — immediate fallback

## L1 → L2/L3 filtering (implemented)

**Modes:**

- **Focus** (block on surface): `is-block-focus` / `is-catalog-lens` — muted/focused at L1/L2/L3
- **Filter** (filter frame): `filteredNoteIndices` + `is-molecule-filtered-out`
  - L1: peel animation + physics suspend
  - L2/L3: `#filter-fringe-zone` at canvas edges; central grid for visible only
- **Spatial snapshot:** `MesoSpatialLayout.captureAndStoreSnapshot()` on L1→L2; column sort by `macroRank`

**Modules:**

```
js/meso-spatial-layout.js
js/catalog-state.js          // visibleNoteIndices, macroRank, lastMesoAnchors
js/depth-v2.js               // layoutMesoColumns, layoutMicroGrid, fringe zone
js/warehouse-core.js         // updateDotFocusFilter — peel at L1, instant at L2/L3
```

**Parameters:**

```
CONFIG.depth.v2.fringe.width
CONFIG.depth.v2.fringe.opacity
CONFIG.depth.v2.fringe.cellScale
```

**Verification:**

1. L1: peel + filter frame
2. L2: fringe at edges, grid without holes
3. L3: same subset + focus on glyphs
4. Remove filter block at L2 → return to grid
5. RESET → clear fringe
6. L1→L2→L3→L1: consistent state

**legacy (not V2):** `CatalogLayoutEngine` uses `visibleNoteIndices` + `macroRank` when present.

## Return to legacy engine

```
depthEngine: 'legacy'
layoutMode: 'catalog'   // or 'legacy-grid'
```

See [`depth-legacy.md`](depth-legacy.md).
