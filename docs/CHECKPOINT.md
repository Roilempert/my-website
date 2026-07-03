# CHECKPOINT — stable state (17 June 2026)

Agreed restore point after fixing RTL navigation, viewport centering, secondary grid, multi-block stretch, hull collision, performance, and **physics stability at 4–7 blocks**.

**Exhibition build:** surface capture is capped at **5 blocks** (`docs/block-cap-policy.md`). Tuning for block 6+ below is documented for a future cap raise — not reachable in the current UI.

**Before physics/navigation changes:** read this file. If regressions appear — compare against the patterns below.

## What works

- Canvas centering (load, block placement, block return to warehouse)
- RTL scroll and edge navigation on a wide canvas (`180vw` at macro)
- Smooth block drag; molecules pull without jitter
- **Secondary grid:** bank molecules move to both sides ("from the sides" effect) — `workspaceCenters`, `tickWorkspaceGridRush`
- Stretch between 2+ blocks with `slotLane` and `layoutMultiBlockStretch`
- Hull collision between molecules + stretched hull outline
- Stable performance (`refreshPhysicsFlags` O(n), bank static)
- **Multi-block physics (up to ~6 blocks):** stable orbits, live stretch — **visually verified**

## Key files

| File | Role |
|---|---|
| `js/app.js` | bundled output (do not edit directly — run `./build-js.sh`) |
| `js/warehouse-orbit.js` | orbits, stretch, `stabilizeOrbitTargets` |
| `js/warehouse-grid.js` | secondary grid, `getOrbitJumpCap`, `getHeavyWorkspaceTier` |
| `js/warehouse-core.js` | block drag, `updateWorkspaceState` |
| `js/physics-engine.js` | Matter.js, pull forces, settling |
| `js/config.js` | CONFIG including `crowdedBlock` |
| `styles.css` | canvas, `#app direction: ltr`, `.note-card direction: rtl` |
| `index.html` | `dir="rtl"` at document level |

## Critical patterns — do not break

### Navigation (`SpatialNavigation`, `AppState.centerViewport`)

- **Centering:** `scrollBy` with delta from `getBoundingClientRect` — not `scrollTo(Math.max(0, …))`
- **Clamp:** `getViewportClampLimits()` — viewport-relative only
- **`constrainScrollPosition`:** disabled during block drag, pan, edge scroll
- **Canvas:** `#app { direction: ltr }` + `.note-card { direction: rtl }`

### Secondary grid / bank — do not break

- `updateWorkspaceState` — sets `workspaceCenters` + `workspaceGridRush = 'out'` on first block
- `tickWorkspaceGridRush` — pulls bank molecules to side columns; **do not clamp dots without `overrideTarget`**
- `syncBankGridStatic` — bank molecules `isStatic` after rush
- `applyWorkspaceVoidExpansion` — void expansion, not column compression
- `isBankGridDot` — O(1) via `item.onBankGrid`

### Physics — smooth pull

- **`smoothOrbitTargets`:** while dragging — `dragBlock: 0.28`
- **`nudgeMoleculeHull`:** weakened to `overrideTarget`
- **`applyMotionSettling`:** stricter snap from block 4 (not on stretched)
- **`afterUpdate` passes:** `1` (normal) / `2` (stretch)

### Physics — multi-block — verified state (17 June)

#### `stabilizeOrbitTargets`

- **`getOrbitJumpCap`:** 3–4 → `scale(90)`; 5 → `scale(46)`; 6+ → `scale(35)`
- **Fuse:** only above `max(scale(150), jumpCap×3)` — **step** `prev + dir×jumpCap` (not freeze on `prev`)
- **`stepBlend`:** max **0.45** (2–5), **0.22** (6+)
- **Body circle:** `overrideTarget` ≤ `scale(280)` from body
- **No** `clampOverrideNearBlocks` — blocks legitimate orbits and hurts secondary grid

#### `_runOrbitPasses` — stretch (single pass)

```
ensureStretchBinding → assignStretchSlotLanes → relaxStretchedMolecules (< 6) → layoutStretchedFromBinding
```

#### `smoothOrbitTargets` / pull (6+)

- Reset lag > `scale(18)` from block **5+**; stretched — extra reset from block **6+**
- **Stretched at 6+:** pull to `rawTarget` when `smoothLag > scale(14)` (does not touch bank)
- After fuse: sync `smoothTarget` to `overrideTarget`
- Entering block 6: `_orbitTransitionTicks` = **120**

#### Fixed bugs — do not reintroduce

| Symptom | Cause | Fix |
|---|---|---|
| `orbitJump` 2000+ | fuse freezes `prev` + double stretch pass | staged fuse; single pass |
| Block 4 stuck | fuse at `scale(90)` = `jumpCap` | threshold `max(scale(150), jumpCap×3)` |
| `settleSnapHits` 90+ | loose snap | stricter snap from block 4 |

#### Do not add (caused regression)

- `clampOverrideNearBlocks` / block-distance cap on all `overrideTarget`
- Forced body snap to block distance in `applyMotionSettling`
- Lag reset from block 3 (too early)
- `rawJump > scale(200)` with clamp to block

### Stable CONFIG (main)

```javascript
targetSmoothing: { singleBlock: 0.18, multiBlock: 0.1, dragBlock: 0.28 }
hullCollision.stretchResolveStrength: 0.48
workspaceGrid.rushDuration: 850
navigation.contentPadding: scale(120)
```

### Block drag

- While dragging: `position: fixed` + `syncBody` with `pageXOffset`
- After placement: `block.x` in page coordinates (no double `pageXOffset` in `bodyX`)

### Navigation minimap (`NavigationMap`)

**Full reference:** `docs/REFERENCE-2026-06-28-navigation-map-scaling.md`

- **Fixed marker:** `viewportMarkerMode: 'fixed'` — same marker size L1/L2/L3; map pans under center
- **Scale:** marker-driven via `computeFixedMarkerScale`; L3 trim `levelMapScaleAdjust: { 3: 0.92 }`
- **Viewport rect:** `getCatalogViewportPageRect()` stays unchanged for general catalog math; `getNavigationMapViewportPageRect()` is minimap-only and tracks the raw browser viewport
- **L1 markers:** `macroMapUseLayerDots: true` — draw live `.layer-dot` positions so the marker visually matches dense macro rows
- **L2 markers:** `mesoMapUseFrameRects: true` + `mesoMapViewportEcho: true` + `mesoMapSilhouetteDetail: false` — draw stable `.meso-mock__frame` rectangles plus the viewport echo; do not use internal line fragments because they caused missing/overlapping markers
- **L2/L3 bounds:** `getDepthMapMarkerBounds()` (drawn glyph/card rects + pad), not raw `#app` alone
- **Do not** drive fixed-mode scale from `levelMapOverscan` alone — causes edge slack / marker outside map

## Fixed bugs (do not reintroduce)

| Symptom | Cause | Fix |
|---|---|---|
| Only right side visible | RTL + `scrollTo(0)` | `scrollBy` + viewport-relative clamp |
| Bank molecules stick | physics on bank | bank static |
| FPS collapse | `isBankGridDot` O(n³) | `onBankGrid` O(n) |

## For agents

When triaging a bug — compare the proposed change to the "do not break" patterns. **Do not add aggressive guards** (block clamp, body snap) without evidence — they break secondary grid and orbits.
