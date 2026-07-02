# L2 stable — grid + gradient + viewport

**Date:** 2026-06-22  
**Status:** verified working (per-note gradient + row window)  
`MesoMock._bakeVersion: 80`

---

## L2 grid

```
CONFIG.depth.v2.meso
  canvasWidth: '175vw'
  colCount: 9
  colGap: 28
  pagePaddingX: 36
  colItemGap: 14
  colMinWidth: 0
  mockColumnFill: 1
```

- ~5–6 columns in frame, rest off-screen (scroll / edge navigation)
- Silhouettes at full column width (`resolveFrameWidthPx` + `mockColumnFill`)
- Layout: `DepthV2.layoutMesoColumns` → `.meso-grid-column`

---

## Gradient (p5) — verified model

**Intent:** Each silhouette = its own mandala (that note's tag colors). The silhouette is a **window** into the gradient — each row reveals a **complementary slice** by row position, not the same strip repeated.

```
mockGradientMode: 'p5'
mockColumnGradient: false   // no shared column texture
```

| Topic | Implementation |
|------|--------|
| Colors | **Per note** — `getShaderTagPalette(item)` + `bakeP5Gradient(item, …)` |
| Bake | per-note only — **not** `bakeColumnP5Gradient` |
| Bake size | uniform ref height + column width — **not** full column height (faster load) |
| Row clip | `applySliceLineLayout`: `mappedY = contentTopInBake + lineTop` → `--meso-mock-line-offset` |
| CSS | `background-size` = bake size × overscale; `background-position: right var(--meso-mock-line-offset)` |
| Cache | `getTagPaletteCacheKey(item)` in cache key |

### p5 (baseline)

```
mockP5Scale: 0.85
mockP5BlendFactor: 0.35
mockP5SeamChance: 0.32
mockP5TextureOverscale: 2.2
mockP5GrainOpacity: 0
```

### Do not do (regression)

- **No** `mockColumnGradient: true` — shared column texture / slice by `stackY` in column
- **No** identical offset for all rows — each row needs different `lineTop`
- **No** WebGL bake at full column height

---

## Viewport — entering L2

```
AppState.centerMesoViewport()
```

- **Center canvas** on screen center (horizontal + vertical) — `scrollBy`, not `scrollLeft = 0`
- Two `requestAnimationFrame` after column layout
- Called from: `changeLevelV2` (L1→L2), `prepareMesoGrid` (after structure), `finishBakeQueueIfIdle`

---

## L2 load (no freeze)

1. `prepareMesoGrid` → `layoutMesoColumns` immediate
2. `applyFirstColumnStructure` + all wrappers with `skipBake: true`
3. `syncAllGlyphsOnL2Enter` + `scheduleAllTextureBakes` (queue)
4. `finishBakeQueueIfIdle` → unfreeze + `SpatialNavigation.resume`

---

## Files

| File | Role |
|------|--------|
| `js/config.js` | `CONFIG.depth.v2.meso` |
| `js/depth-v2.js` | grid, `prepareMesoGrid`, columns |
| `js/meso-mock.js` | silhouettes, `applySliceLineLayout`, `bakeP5Gradient` |
| `js/app-state.js` | `centerMesoViewport` |
| `js/depth-controller.js` | `changeLevelV2` |
| `styles.css` | `.is-meso-column-layout`, glyph L2 |

---

## Do not break

- `centerViewport` / clamp — `scrollBy` + `getViewportClampLimits` (see `docs/CHECKPOINT.md`)
- `is-macro-to-meso .depth-v2-glyph` — hide only at `view-level-1`
- ref height only for bake — not column height
- per-note tags + per-line slice — not column tapestry

---

## Restore

1. Copy values from sections above
2. `./build-js.sh`
3. `_bakeVersion++` in `js/meso-mock.js`
4. Hard refresh → L2
