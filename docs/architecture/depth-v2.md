# Depth V2 — L2 micro (active)

Two **navigable** depth levels: **L1 macro** (physics dots) and **L2 micro** (full notes grid).

**Depth naming:** Docs and UI use **L1** / **L2**. Internal code still indexes micro as level **`3`** (`activeLevels: [1, 3]`, `view-level-3`, `DepthController.currentLevel === 3`). **Legacy meso** (silhouettes / MesoMock, code level `2`) is not navigable — removed from navigation (2026-07-05); `SilhouetteEngine` kept for opening-screen art only.

| Doc / UI | Role | Code level | CSS / config |
|----------|------|------------|--------------|
| **L1** | Macro — physics dots | `1` | `view-level-1` |
| **L2** | Micro — full notes grid | `3` | `view-level-3` |
| Legacy meso | Silhouette art only | `2` | `view-level-2` (dead path) |

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
| **Canvas (L2 micro)** | Scrollable `#app` workspace — note layout at micro | `CONFIG.depth.v2.micro` (wider than viewport) |

Do not change canvas column counts when adjusting the 24×12 shell.

## Work phases

| Phase | Status | Description |
|-----|--------|--------|
| 1 | **active** | L2 micro canvas grid + legacy meso code retained for art paths |
| 2 | pending | Layer transitions (scroll → FX → reveal) |
| 3 | **target** | **Typographic silhouettes** for opening-screen art via `SilhouetteEngine` (project goal in `AGENTS.md`) — see [`experience-model.md`](experience-model.md) |

MesoMock is a **legacy stand-in**, not the intended exhibition look for silhouettes.

## Canvas grids (current `config.js`)

| Layer | Canvas width | Columns | Notes |
|------|-------------|---------|--------|
| L2 micro | (viewport-driven) | 12 | `viewportCols: 3` in frame |

Legacy meso grid (`CONFIG.depth.v2.meso`) remains in config for silhouette/meso code paths — not user-navigable.

Values in:

```
CONFIG.depth.v2.meso   // legacy — opening art / MesoMock only
CONFIG.depth.v2.micro  // L2 micro grid
```

## Legacy meso placeholder (MesoMock)

Not navigable. Until silhouette art is fully wired, meso-related modules may still run for opening-screen geometry:

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

## Layer isolation (L1 ↔ L2)

**Rule:** Filters, block deployment, and word-study selection on one layer **do not carry** to the other. Every L1↔L2 switch resets to default:

- All active blocks return to the warehouse dock (L1 surface + L2 depth bar)
- Filter/focus lens cleared (`filteredNoteIndices`, focus/mute classes, workspace grid)
- Censored L2 word commits, study unlocks, and word panel chips cleared when leaving L2
- `CatalogState` lens snapshot cleared; grid relayouts without exclusions

**Entry point:** `DepthController.changeLevel()` → `ActionWarehouse.clearStudyStateForLayerLeave(prevLevel)` before the level swap.

**Modules:**

```
js/warehouse-core.js   — clearStudyStateForLayerLeave, _returnAllActiveBlocksToDock
js/note-censor.js      — resetForLayerLeave (word study)
js/catalog-state.js    — resetForLayerSwitch
```

## L1 → L2 filtering (per-layer, reset on switch)

**Modes** *(active only while staying on the same layer)*:

- **Focus** (block on surface / depth bar): `is-block-focus` / `is-catalog-lens` — muted/focused
- **Filter** (filter frame): `filteredNoteIndices` + `is-molecule-filtered-out`
  - L1: peel animation + physics suspend
  - L2: central grid for visible only (`.is-layout-excluded` for filtered notes)
- **Spatial rank:** `CatalogState.macroRank` — cleared on layer switch

**Modules:**

```
js/meso-spatial-layout.js
js/catalog-state.js          // visibleNoteIndices, macroRank, lastMesoAnchors
js/depth-v2.js               // layoutMesoColumns, layoutMicroGrid, fringe zone
js/warehouse-core.js         // updateDotFocusFilter — peel at L1, instant at L2
```

**Parameters:**

```
CONFIG.depth.v2.fringe.width
CONFIG.depth.v2.fringe.opacity
CONFIG.depth.v2.fringe.cellScale
```

**Verification:**

1. L1: deploy block + filter → switch to L2 → clean grid, no blocks, no word panel
2. L2: commit words + deploy filter block → switch to L1 → full macro field, blocks in dock
3. Return to either layer → previous layer state is **not** restored
4. `נקה לוח` still clears within the current layer only

**legacy (not V2):** `CatalogLayoutEngine` uses `visibleNoteIndices` + `macroRank` when present.

## Return to legacy engine

```
depthEngine: 'legacy'
layoutMode: 'catalog'   // or 'legacy-grid'
```

See [`depth-legacy.md`](depth-legacy.md).
