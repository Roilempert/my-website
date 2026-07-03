# REFERENCE — navigation minimap scaling (28 June 2026)

**Purpose:** Verified restore point for the bottom-right navigation minimap across L1/L2/L3. Fixed viewport marker; map pans underneath; layer-specific scale tuning; marker rect tracks the raw browser viewport.

**Pair with:** `docs/CHECKPOINT.md` for canvas scroll/physics patterns (do not conflate minimap pan with main `SpatialNavigation` clamp rules).

---

## Verified working

- Minimap visible at all depth levels (macro / meso / micro)
- **Fixed viewport marker** — same compact UI size on L1/L2/L3
- Map content pans under the centered marker (`viewportFollow: true`)
- Viewport marker tracks the visible navigation-map viewport vs canvas (not a fixed ratio guess)
- L3 map scale tuned so marker reaches map content edge at scroll extremes
- L2/L3 bounds from drawn depth glyphs (note cards / meso lines), not full `#app` rect alone
- Transition dimming split: map stays readable during depth transitions

---

## Key files

| File | Role |
|---|---|
| `js/navigation-map.js` | Render, `computeTransform`, fixed marker scale, depth bounds, pan |
| `js/spatial-navigation.js` | `getNavigationMapViewportPageRect()` — raw browser viewport for minimap marker/pan |
| `js/config.js` | `CONFIG.navigationMap` — marker mode, overscan, L3 scale adjust |
| `styles.css` | `.site-navigation-maps__*` — frame, clip, marker overlay |
| `js/app.js` | Bundled output — run `./build-js.sh` after source edits |

---

## Stable CONFIG (`CONFIG.navigationMap`)

```javascript
viewportMarkerMode: 'fixed',
viewportMarkerWidthRatio: 0.72,  // max width cap; actual width = height × viewport aspect
viewportMarkerHeightRatio: 0.4, // compact marker height, consistent across layers
viewportFollow: true,
viewportFollowStrength: 1,
viewportFollowClamp: false,
levelMapScaleAdjust: { 3: 0.92 }, // L3 only — map slightly smaller so marker hits content edge
levelMapOverscan: { 1: 1.55, 2: 3.05, 3: 5.0 }, // scaled marker mode only
depthMapBoundsPad: 32,
depthMapLayoutSettleMs: 480,
sharedReferenceScale: true,
macroMapUseDomPositions: true,
macroMapUseLayerDots: true,
macroMapMaxDots: 900,
mesoMapUseFrameRects: true,
mesoMapMaxFrameRects: 320,
mesoMapViewportEcho: true,
mesoMapSilhouetteDetail: true,
mesoMapCenterSilhouetteFragments: false,
mesoMapScaleSilhouetteFragments: false,
mesoMapSilhouetteFragmentScale: 1,
mesoMapMaxDetailRects: 2500,
mesoMapEchoSettleMs: 120,
mesoFrameFill: 'rgba(45, 45, 45, 0.28)',
mesoFrameEchoFill: 'rgba(45, 45, 45, 0.32)',
```

**Do not change `levelMapScaleAdjust[3]` without testing L3 scroll corners.** Tune in steps of ~0.01–0.02. Too high → marker sits inside map with edge slack; too low → viewport projection smaller than marker box.

---

## Scaling model (fixed marker mode)

1. **Marker size** — `getFixedViewportMarkerSize(viewport)`: height from frame ratio; width from viewport aspect (capped by `viewportMarkerWidthRatio`).
2. **Map scale** — `computeFixedMarkerScale(viewport)` = `min(fixed.w / vp.w, fixed.h / vp.h)`.
3. **Per-level adjust** — `levelMapScaleAdjust[level]` multiplies scale in **both** fixed and scaled marker branches (L3 uses `0.92`).
4. **L1 exception** — `resolveMacroMapScale()` still applies block/min-scale lock on top of fixed scale.
5. **Pan** — viewport center mapped to frame center: `followX = anchorX - (vpCenterX - bounds.minX) * scale`.

In fixed mode, `levelMapOverscan` does **not** drive scale; it only applies when `viewportMarkerMode !== 'fixed'`.

---

## Viewport Rects

`SpatialNavigation.getCatalogViewportPageRect()`:

- `left/top` = scroll + `contentPadding`
- `width` = `innerWidth - 2 * contentPadding`
- `height` = `innerHeight - contentPadding` (includes warehouse + minimap strip — **do not** subtract `getScrollReserve()` as viewport height)

`SpatialNavigation.getNavigationMapViewportPageRect()`:

- `left/top` = `pageXOffset` / `pageYOffset`
- `width` = `innerWidth`
- `height` = `innerHeight`

Main canvas clamp rules in `CHECKPOINT.md` still apply to page scroll. The minimap marker, scale, pan bounds, drag, and click-to-center behavior use the navigation-map viewport rect so the marker describes the browser viewport, including rows that remain visible behind or around fixed chrome.

---

## L2/L3 content bounds

| Level | Bounds source |
|---|---|
| L3 | `getDepthMapMarkerBounds()` — union of `.note-card` page rects + `depthMapBoundsPad` |
| L2 | `getDepthMapMarkerBounds()` from visible `.meso-mock__frame` rectangles; rendered map content keeps stable frame rectangles and draws original `.meso-mock__line` fragments inside each frame |
| L1 | `SpatialNavigation.getMapReferenceBounds()` + live `.layer-dot` DOM positions |

L3 must use marker bounds, not raw `#app` scroll extents alone — prevents ~15px edge slack and “marker outside map” at corners.

---

## Do not break

| Pattern | Why |
|---|---|
| Fixed marker centered in `.site-navigation-maps__map-wrap`; canvas pans via `translate` | User sees stable viewport frame; map moves |
| `levelMapScaleAdjust` applied after fixed-marker scale branch | Was previously scaled-mode-only; broke L3 edge alignment |
| `getCatalogViewportPageRect` remains unchanged for general catalog math | Avoids changing main scroll/clamp behavior |
| `getNavigationMapViewportPageRect` uses raw browser viewport for minimap marker/pan only | Marker matches the rows visitors actually see on screen |
| L3 `getActiveDepthMapBounds()` → `getDepthMapMarkerBounds()` | Full app bounds oversize the map vs scroll range |
| `./build-js.sh` after `navigation-map.js` / `config.js` edits | `app.js` is bundled |

### Do not reintroduce

| Symptom | Likely cause |
|---|---|
| Marker smaller on L2/L3 than L1 | Scaled marker mode or overscan-only scale without fixed branch |
| Marker “outside” map at L3 corners | Scale from `contain × levelMapOverscan` instead of marker-driven scale |
| Marker shows too few macro rows | Using padded or chrome-subtracted viewport instead of raw browser viewport |
| L3 map too large vs marker at edges | Missing or too-high `levelMapScaleAdjust[3]` |
| Scroll lock / physics jitter | Unrelated — see `CHECKPOINT.md`; do not fix minimap by changing scroll clamp during drag |

---

## Tuning guide (future bug fixes)

1. Reproduce at **L3 scroll corners** (top-left, bottom-right).
2. Compare marker edge to nearest drawn map content edge inside clip frame.
3. Adjust **`levelMapScaleAdjust[3]`** only (start ±0.02):
   - Gap at edges → **decrease** (e.g. `0.90`)
   - Viewport box smaller than marker interior → **increase** (e.g. `0.94`)
4. If slack is uniform on all sides, check **`depthMapBoundsPad`** (bounds too loose).
5. If marker size wrong on all layers, tune **`viewportMarkerHeightRatio`** / **`viewportMarkerWidthRatio`**, not L3 adjust alone.
6. Run `./build-js.sh`; hard-refresh browser.

---

## For agents

Before changing minimap scale or bounds: read this file. Compare against the stable CONFIG block above. Prefer surgical config tweaks over new pan/clamp logic. Do not modify main canvas `centerViewport` / `constrainScrollPosition` behavior to fix minimap alignment.
