# REFERENCE — working layout & boot state (25 June 2026)

**Purpose:** Restore point after fixing blank-screen regressions. Site loads, shows warehouse dock, fetches sheet data, renders macro dots and physics.

**Pair with:** `docs/CHECKPOINT.md` for physics/navigation patterns (4–7 blocks, stretch, secondary grid).

---

## Verified working

- Page visible on load (gray background + warehouse dock)
- Google Sheets CSV pipeline → notes rendered as dots (macro L1)
- Matter.js physics runs (local bundle, no CDN dependency)
- Fixed visual scale `0.72` — no viewport-responsive scaling layer
- Standard HTML structure: `#nav-surface` + `#app` directly in `body` (no display frame wrapper)
- Boot survives slow/failed network (fetch timeout + safety reveal)

---

## Key files (this state)

| File | Role |
|---|---|
| `index.html` | `vendor/matter.min.js` → `js/config.js` → `js/app.js`; body = nav surface + `#app` |
| `vendor/matter.min.js` | Matter.js 0.19.0 — bundled locally for campus/offline |
| `js/config.js` | `VISUAL_SCALE = 0.72`, `scale()`, `CONFIG.boot` timeouts |
| `js/bootstrap.js` | Init order + async data after warehouse ready |
| `js/app-state.js` | `init()` → fetch/render; `finishBoot()` → populate → reveal → physics |
| `js/physics-engine.js` | Guards if `Matter` missing; `buildWorld()` no-ops without engine |
| `js/warehouse-core.js` | `refreshDisplayTokens()` uses `scale()` for dock metrics |
| `styles.css` | `#app { opacity: 1 }`; fixed typography (no responsive `clamp()` tokens) |
| `build-js.sh` | Bundles modules → `js/app.js` — **no** `responsive-layout.js` |

---

## Scaling (do not change without testing)

```javascript
const VISUAL_SCALE = 0.72;
const scale = (px) => Math.round(px * VISUAL_SCALE);
```

`applyVisualScaleTokens()` sets dot size, depth/catalog tokens, meso anchors — **not** live typography CSS vars.

Typography in CSS uses fixed rem/pt (e.g. `.note-title { font-size: 4.125rem }`).

---

## Boot sequence (critical order)

```
DOMContentLoaded
  applyVisualScaleTokens()
  DepthController.init()
  SilhouetteEngine.init()
  SpatialNavigation.init()
  ArtifactInspector.init()
  ActionWarehouse.init()          ← warehouse DOM must exist first
  PhysicsEngine.init()            ← try/catch; skips if Matter missing
  IdleRefresh.init()
  AppState.init()                 ← async: fetch CSV → render notes
    .then → AppState.finishBoot()
      ActionWarehouse.populate()   ← only after warehouse init
      revealApp()
      setTimeout → centerViewport + PhysicsEngine.buildWorld()
```

**Never call `ActionWarehouse.populate()` before `ActionWarehouse.init()`.** That race caused blank screens (threw before `#app` could reveal).

---

## Boot resilience

| Setting | Value | Role |
|---|---|---|
| `CONFIG.boot.fetchTimeoutMs` | 15000 | Abort hung Google Sheets fetch |
| `CONFIG.boot.safetyRevealMs` | 10000 | Fallback `revealApp()` if pipeline stalls |
| `CONFIG.boot.physicsBuildDelay` | 350 | Delay before `buildWorld()` after render |

`#app` CSS: `opacity: 1` — content not hidden behind a fade gate.

---

## How to run locally

Use **HTTP**, not `file://` (sheet fetch needs a server):

- Cursor/VS Code **Live Server** → right-click `index.html`
- Or: `python3 -m http.server 8080` (requires Command Line Tools on Mac)

Hard refresh after code changes: **Cmd+Shift+R**.

Rebuild bundle after editing `js/*.js` modules:

```bash
./build-js.sh
```

---

## Failed experiments — do not reintroduce without a new reference

| Change | Why it broke |
|---|---|
| `js/display-viewport.js` + `#display-frame` / 4096×2304 lock | Content off-screen / letterbox blank |
| `js/responsive-layout.js` + `getResponsiveFactor()` | Boot race + hidden `#app`; user-verified revert |
| `#app { opacity: 0 }` as sole visibility gate | Blank page if any boot step throws |
| Matter.js CDN only | Campus WiFi blocks CDN → physics throws |
| `ActionWarehouse.populate()` inside `AppState.init()` before warehouse init | Uncaught throw → no reveal |

---

## Restore checklist

If layout/boot regresses, compare against:

1. This file — structure, boot order, scaling
2. `docs/CHECKPOINT.md` — physics, scroll, stretch
3. `index.html` — no display frame; local `vendor/matter.min.js`
4. `js/bootstrap.js` — order above
5. `js/config.js` — `VISUAL_SCALE = 0.72`, no `CONFIG.responsive` / `CONFIG.display`

---

## Agent handoff

New chat for layout/boot issues: attach `@AGENTS.md` + this file.  
Physics-only issues: add `@docs/CHECKPOINT.md`.
