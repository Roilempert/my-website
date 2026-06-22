# Baseline — p5 mandala gradient (L2)

**ID:** `p5-mandala-v1`  
**Date:** 2026-06-21  
**Status:** approved — saved version (after "great", before grain / aggressive sharpness)  
**Bake:** `MesoMock._bakeVersion: 32`

---

## What is preserved here

Approved look of **mockGradientMode: p5** — mandala morph (ported from p5 sketch):

- Concentric rings — each ring = one tag, 4–8 circles in one color
- **Uniform** gradient size for all silhouettes (not row-count dependent)
- Seam tags — some colors injected in the gap between two circles (not as a ring)
- Rare random sharpness — **one circle** only (~25% of notes)
- **No** DOM grain on p5
- Soft fade (original sketch values)

**Not included:** physics, navigation, L2 grid layout, legacy shader.

---

## Files

| File | Role |
|------|--------|
| `js/meso-gradient-p5.js` | shader + `buildMandalaFromTags` |
| `js/meso-mock.js` | bake, slice per-line, ref height, cache |
| `js/config.js` | all `mockP5*` keys |
| `styles.css` | `[data-gradient-mode="p5"]` — overscale + clip |

---

## config — approved values

```
CONFIG.depth.v2.meso
```

```javascript
mockGradientMode: 'p5',
mockP5Scale: 0.85,
mockP5TagFit: 3.2,
mockP5BlendFactor: 0.35,
mockP5Falloff: 4.0,
mockP5MaskSoft: 0.2,
mockP5SharpChance: 0.25,
mockP5SharpFalloff: 6.5,
mockP5SharpBlendK: 0.24,
mockP5SeamChance: 0.32,
mockP5SeamStrength: 1.4,
mockP5TextureOverscale: 2.2,
mockGrainOpacity: 0,          // grain off for p5
mockShaderBgColor: '#F3F3F3',
mockGradientSoftness: 0.02,
mockColorEnrich: 0.18,
```

---

## Graphic logic

### Tags → mandala mapping

| Layer | Tags |
|------|--------|
| Core | tag 0 — single circle at hub |
| Inner ring | tag 1 — 4–8 circles, one color |
| Outer ring | tag 2 — 4–8 circles |
| More rings | tags 3… — distance chain |

**Single tag:** core + two rings, all same color.

**Seam:** tags 1…N with probability `mockP5SeamChance` — color injected between random circle pair (shader: `gap ≈ 0`).

**Sharpness:** ~25% of notes — `u_sharpCircle` = single circle index; other circles `blend 0.35` / `falloff 4.0`.

### Hub + UV

- Hub = **right-center** (RTL): `(res.x, res.y * 0.5)`
- Normalization: `/ min(w, h)` — round circles

### Uniform size

```
MesoMock.getGradientRefLineCount()  // max 11 rows
MesoMock.getGradientRefHeightPx()
```

Bake + `--meso-mock-gradient-h` + offset centered by overscale.

### Display

```css
background-size: gradient-w × overscale, gradient-h × overscale
background-position: right + line-offset
overflow: hidden  /* clip, not stretch */
```

---

## Do not break (baseline)

- `centerViewport` / scroll — do not touch (see `docs/CHECKPOINT.md`)
- Hub on the right — do not center on canvas
- Ring = one color for all circles in it
- `mockP5BlendFactor: 0.35` + `mockP5Falloff: 4.0` — **do not** lower to 0.24 / 7.5 (colors disappear)
- Grain on p5 — **off** (`mockGrainOpacity: 0`, `::after { display: none }`)
- Sharpness — **one** circle only, not per-circle arrays
- Uniform overscale on width and height

---

## Identified regressions

| Change | Result |
|--------|--------|
| `blendFactor 0.24`, `falloff 7.5` | colors nearly invisible |
| grain `opacity 0.82` | too strong on p5 |
| per-circle sharpness (~42%) | muddy / dirty look |
| overscale on width only | stretch on wide silhouettes |

---

## Quick restore

1. Copy config values from the table above
2. `./build-js.sh`
3. Bump `MesoMock._bakeVersion` in `js/meso-mock.js`
4. Hard refresh + L2

---

## Links

- [`depth-v2.md`](depth-v2.md) — L2 architecture
- [`../CHECKPOINT.md`](../CHECKPOINT.md) — physics stability
