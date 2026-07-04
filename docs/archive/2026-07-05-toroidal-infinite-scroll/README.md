# Toroidal infinite scroll (L2/L3) — archived experiment

**Archived:** 2026-07-05  
**Reverted to:** commit on `main` recorded in `restore-base-commit.txt` (stable liminal grid + minimap per `docs/REFERENCE-2026-06-28-navigation-map-scaling.md`).

## What this was

An attempt at **seamless toroidal pan** at L2/L3: column/row grid cycling with logical map coordinates, without duplicating note DOM. L1 macro scroll/physics stayed unchanged.

## Contents

| File | Purpose |
|------|---------|
| `toroidal-grid-full.patch` | Full `git diff` against restore base — all module edits from this experiment |
| `js/toroidal-pan.js` | Grid cycling, logical position stamp, map viewport wrap |
| `js/text-direction.js` | English LTR / Hebrew RTL note frames (bundled in experimental `build-js.sh`) |

## Key touched modules (in patch)

- `js/toroidal-pan.js` (new)
- `js/spatial-navigation.js` — route L2/L3 pan to toroidal
- `js/navigation-map.js` — toroidal bounds, scaled viewport marker, echo fix
- `js/depth-v2.js` — toroidal slot assignment, `finalizeMapLayout`
- `js/config.js` — `CONFIG.navigation.toroidalWrap`
- `build-js.sh` — bundle `toroidal-pan.js`, `text-direction.js`

## To restore this experiment

```bash
# From repo root, on a branch (not required on main if you prefer a feature branch)
git apply docs/archive/2026-07-05-toroidal-infinite-scroll/toroidal-grid-full.patch
cp docs/archive/2026-07-05-toroidal-infinite-scroll/js/toroidal-pan.js js/
cp docs/archive/2026-07-05-toroidal-infinite-scroll/js/text-direction.js js/  # if using text-direction bundle
./build-js.sh
```

Resolve any conflicts if `main` has diverged. Re-enable in `js/config.js`:

```javascript
toroidalWrap: { enabled: true, axes: 'both' }
```

## Why reverted

Map/canvas sync at L2/L3 remained unreliable with fixed-marker follow-pan + grid cycling. Production exhibition path uses the **reference minimap** (fixed marker, map pans under marker, raw viewport rect) documented in `docs/REFERENCE-2026-06-28-navigation-map-scaling.md`.
