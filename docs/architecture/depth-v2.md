# Depth V2 — L2/L3 (active)

## Current state

```
CONFIG.depth.depthEngine: 'v2'
```

The legacy engine (catalog, complex transitions) is **frozen** — code remains in the project but is inactive in this mode.

Code file:

```
js/depth-v2.js
```

## Work phases

| Phase | Status | Description |
|-----|--------|--------|
| 1 | **active** | Two separate grids + silhouette mock (`MesoMock`) |
| 2 | pending | Layer transitions |
| 3 | pending | Real content (silhouettes, notes) |

## Grids (defaults)

| Layer | Canvas width | Columns | Cell height |
|------|-----------|--------|---------|
| L2 meso | `220vw` | 12 | 64px scaled |
| L3 micro | `300vw` | 8 | 120px scaled |

Values in:

```
CONFIG.depth.v2.meso
CONFIG.depth.v2.micro
```

## Silhouette mock (MesoMock)

In V2, L2 shows a **light mock** — not `SilhouetteEngine`:

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
