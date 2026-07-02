# Cleanup Report — עקבות / my-website

**Generated:** 2026-07-02  
**Scope:** Read-only audit. No files were modified or deleted.  
**Active engine:** `CONFIG.depth.depthEngine === 'v2'` (see `js/config.js`)

This document lists candidates for cleanup, grouped by risk. Each item has a **recommendation** and **verification** steps for Phase 2 approval.

---

## How to use this report (Phase 2)

1. Review each section and mark items: **DELETE** / **KEEP** / **DEFER**
2. For code removals, prefer one category at a time and run `./build-js.sh` + manual smoke test after each batch
3. For exhibition/USB copies, confirm `Start Local Server.command` still works before deleting launcher files
4. Physics/navigation changes: compare against `docs/CHECKPOINT.md` before approving removals in warehouse/physics modules

---

## Summary

| Category | Items | Typical risk |
|----------|-------|--------------|
| Untracked screenshots | 2 | Low |
| Explicitly archived code | 1 file + dormant runtime | Low–Medium |
| Unused font assets | 33 of 40 tracked `.woff2` | Low (size savings) |
| macOS junk in fonts folder | `.DS_Store` | Low |
| Build artifact duplication | `js/app.js` (~16.7k lines) | Medium (workflow) |
| Legacy depth engine (frozen) | ~6 modules + CSS | High (intentional fallback) |
| Alternate L2 gradient modes | shader/canvas/blobs/svg/bands | Medium (dev presets) |
| Exhibition launcher overlap | 3 entry points | Low (consolidation) |
| Documentation drift | 3+ doc issues | Low |
| Stale config keys | 2+ keys | Low |
| Data CSV unused columns | 2 columns | Low |

---

## 1. Untracked temporary files

These are **not in git** and are not referenced by the site.

| File | Size / type | Notes | Recommendation |
|------|-------------|-------|----------------|
| `site-full.png` | 1800×1333 PNG | Appears to be a full-page screenshot (likely agent/debug capture) | **DELETE** unless you need it for documentation |
| `site-viewport.png` | 1200×682 PNG | Viewport screenshot, same purpose | **DELETE** unless you need it for documentation |

**Verify:** `grep -r site-full site-viewport .` — should return no references (confirmed at audit time).

---

## 2. Explicitly archived / dormant features

### 2a. `js/archive/warehouse-filter-frame.js`

- **Status:** Documented as archived; **not** included in `build-js.sh`
- **Purpose:** Black filter/deletion frame block for the warehouse tray
- **Related dormant runtime** (still bundled, inactive):
  - `CONFIG.warehouse.enableFilterFrame: false` in `js/config.js`
  - `js/warehouse-filter.js` — peel/hollow animations
  - CSS: `.action-block--frame-filter` in `styles.css`
  - Hooks in `js/warehouse-core.js` guarded by `enableFilterFrame`

| Recommendation | Risk |
|----------------|------|
| **KEEP** archive file if you may restore the feature | Low |
| **DELETE** archive only — safe; runtime stays dormant | Low |
| **DELETE** archive + filter runtime + CSS — only if you are sure the feature is abandoned | Medium |

**Verify before full removal:** Search `enableFilterFrame`, `warehouse-filter`, `frame-filter` across `js/` and `styles.css`.

---

## 3. Font assets — unused files

**Referenced in `styles.css` (`@font-face`):** 7 files  
**Tracked in git:** 40 `.woff2` files  
**Unused by CSS:** 33 files (~1.1 MB+ of duplicates/experiment fonts)

### 3a. Used (KEEP)

```
HelveticaNeue-01.woff2          — body fallback
NarkissTam-Regular-TRIAL.woff2  — body
Neoklass-BoldItalic-TRIAL.woff2 — display / titles
NarkissYair-Regular-TRIAL.woff2 — UI chrome
Ratzif22-Regular.woff2          — meta
Ratzif22-Medium.woff2           — meta
Ratzif22-Bold.woff2             — meta
```

### 3b. Unused — safe deletion candidates

**NarkissBlockMono (experiment, never wired):**
- `NarkissBlockMono-Medium-TRIAL.woff2`
- `NarkissBlockMono-Regular-TRIAL.woff2`
- `NarkissBlockMono-Semibold-TRIAL.woff2`

**NarkissTam — weights not declared (only Regular is used):**
- `NarkissTam-Black-TRIAL.woff2`
- `NarkissTam-Bold-TRIAL.woff2`
- `NarkissTam-Heavy-TRIAL.woff2`
- `NarkissTam-Light-TRIAL.woff2`
- `NarkissTam-Medium-TRIAL.woff2`
- `NarkissTam-Semibold-TRIAL.woff2`

**NarkissYair — weights not declared (only Regular is used):**
- `NarkissYair-Bold-TRIAL.woff2`
- `NarkissYair-BoldMono-TRIAL.woff2`
- `NarkissYair-Light-TRIAL.woff2`
- `NarkissYair-LightMono-TRIAL.woff2`
- `NarkissYair-RegularMono-TRIAL.woff2`

**Neoklass — weights not declared (only BoldItalic is used):**
- `Neoklass-Black-TRIAL.woff2`
- `Neoklass-BlackItalic-TRIAL.woff2`
- `Neoklass-Bold-TRIAL.woff2`
- `Neoklass-Italic-TRIAL.woff2`
- `Neoklass-Light-TRIAL.woff2`
- `Neoklass-LightItalic-TRIAL.woff2`
- `Neoklass-Medium-TRIAL.woff2`
- `Neoklass-MediumItalic-TRIAL.woff2`
- `Neoklass-Regular-TRIAL.woff2`
- `Neoklass-Thin-TRIAL.woff2`
- `Neoklass-ThinItalic-TRIAL.woff2`

**Other families never referenced:**
- `NeueMontreal-Regular.woff2`
- `SimplerPro_HLAR-Regular 2.woff2` ⚠️ macOS duplicate name (`" 2"`)
- `SimplerPro_HLAR-Semibold 2.woff2` ⚠️ macOS duplicate name
- `SimplerPro_HLAR_Mono-Bold.woff2`
- `SimplerPro_HLAR_Mono-Medium.woff2`
- `SimplerPro_HLAR_Mono-Regular.woff2`
- `TheBasics-Mono.woff2`
- `TheBasics-Regular.woff2`

### 3c. macOS junk

| File | Recommendation |
|------|----------------|
| `assets/fonts/.DS_Store` | **DELETE** — already covered by `.gitignore` pattern for `.DS_Store` but present on disk |

**Verify after font cleanup:** Load site, check L3 note titles (Neoklass), body (NarkissTam), tags/ID (ratzif22), warehouse labels (NarkissYair).

---

## 4. Build system — duplicate `js/app.js`

| Aspect | Detail |
|--------|--------|
| Source of truth | 26 modules in `js/*.js` (see `build-js.sh`) |
| Bundle output | `js/app.js` — ~16,705 lines, concatenation of all modules |
| Loaded by | `index.html` → `js/app.js` |
| CI | `.github/workflows/deploy-pages.yml` runs `./build-js.sh` before deploy |

**This is intentional duplication**, not accidental copy-paste. Editing `app.js` directly is wrong; `docs/CHECKPOINT.md` and `build-js.sh` say to edit modules and rebuild.

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **KEEP as-is** | Exhibition USB works without running build; git diff shows bundle state | Every module edit duplicates ~16k lines in commits | **KEEP** for graduation/exhibition safety |
| **Gitignore `app.js`** | Cleaner diffs | USB/offline copy breaks unless user runs `build-js.sh` | **DEFER** unless you always ship pre-built |
| **Remove modules, monolith only** | Single file | Loses modular workflow you already use | **Do not** |

**Not a deletion candidate** unless you explicitly change the build/deploy workflow.

---

## 5. Legacy depth engine (frozen, still bundled)

**Current config:** `depthEngine: 'v2'` — legacy engine is inactive but code remains for rollback (`docs/architecture/depth-legacy.md`).

### 5a. Modules primarily serving legacy mode

| Module | Lines | V2 usage |
|--------|-------|----------|
| `js/depth-transition-orchestrator.js` | 218 | Bypassed when `DepthV2.isActive()`; still referenced with guards |
| `js/macro-meso-bridge.js` | 502 | Macro→meso reveal animation; skipped in V2 wheel path |
| `js/catalog-layout-engine.js` | 245 | `layoutMode: 'legacy-grid'` branch; V2 uses `depth-v2.js` grids |
| `js/silhouette-engine.js` | 362 | `onLevelEnter` returns immediately in V2; **still used** for `measureElementLineRects` by `meso-mock.js` |
| `js/catalog-state.js` | 150 | Still used in V2 (filter criteria, layout state) |

### 5b. Legacy DOM still in every note

`js/render-engine.js` still injects `.meso-silhouette` SVG markup alongside V2 `.meso-mock` glyphs. In V2, silhouettes are hidden via CSS (`body.is-depth-v2 .meso-silhouette { … }`) but DOM nodes remain.

### 5c. Legacy CSS (~52 rules in `styles.css`)

Classes such as `is-catalog-layout`, `is-catalog-settling`, `is-macro-to-meso`, `is-meso-to-micro`, `.meso-silhouette__*` — mostly inactive under V2 but still referenced if you switch `depthEngine` back to `'legacy'`.

| Recommendation | Risk |
|----------------|------|
| **KEEP all legacy code** until after exhibition | **Safest** |
| Remove legacy modules + CSS | **HIGH** — breaks rollback to catalog engine |
| Remove only `.meso-silhouette` DOM + `SilhouetteEngine` | **HIGH** — `meso-mock.js` calls `SilhouetteEngine.measureElementLineRects` |

**Verify:** Only consider legacy removal after confirming you will never use `depthEngine: 'legacy'` again.

---

## 6. Alternate L2 gradient modes (inactive path)

**Active mode:** `CONFIG.depth.v2.meso.mockGradientMode: 'p5'` (mandala bake)

**Still in codebase** (for preset switching / experiments):

| Mode | Primary code |
|------|----------------|
| `p5` | `js/meso-gradient-p5.js` — **active** |
| `shader` | `js/meso-gradient-engine.js`, `js/meso-gradient-sdf-preset.js`, `js/meso-gradient-visual-preset.js` |
| `canvas` | canvas bake in `js/meso-mock.js` |
| `blobs` / `svg` / `bands` | HTML/SVG builders in `js/meso-mock.js` + matching CSS `[data-gradient-mode=…]` |

| Recommendation | Risk |
|----------------|------|
| **KEEP** shader/canvas/blobs while iterating on L2 visuals | Low cost |
| Remove non-p5 modes + presets + CSS | **Medium** — documented in `docs/architecture/meso-gradient-p5-baseline.md` as rollback reference |

**Verify:** Set `mockGradientMode` to `'shader'` temporarily; confirm L2 still renders before deleting shader stack.

---

## 7. Exhibition / local server launchers (overlap)

Three ways to start the local server:

| Entry point | Role |
|-------------|------|
| `Start Local Server.command` | **Primary** — self-contained Python/Ruby HTTP server + Chrome open |
| `Start Site.app` | macOS app wrapper → opens `.command` |
| `scripts/serve-exhibition.sh` | Thin wrapper: `exec bash "$DIR/Start Local Server.command"` |

Supporting docs (untracked, exhibition-specific):
- `EXHIBITION-START-HERE.txt`
- `READ ME FIRST — macOS security.txt`

| Item | Recommendation |
|------|----------------|
| `scripts/serve-exhibition.sh` | **DELETE** or merge into docs only — redundant with `.command` |
| `Start Site.app` | **KEEP** if iMac users prefer double-clicking an app |
| `EXHIBITION-START-HERE.txt` + security txt | **KEEP** for exhibition handoff |
| `Start Site.app/Contents/_CodeSignature/*` | **KEEP** if distributing the `.app`; regenerates if you rebuild the app |

**Note:** `EXHIBITION-START-HERE.txt` says the launcher works without `scripts/` — consistent with deleting `serve-exhibition.sh`.

---

## 8. Scripts — one-time setup

| File | Purpose | Recommendation |
|------|---------|----------------|
| `scripts/setup-git.sh` | One-shot `git init`, first commit, optional `gh repo create` | **KEEP** in repo or move to docs — harmless; only run once |
| `build-js.sh` | **Required** — rebuilds bundle | **KEEP** |

---

## 9. Documentation — drift and orphans

### 9a. Outdated references

| Location | Issue |
|----------|-------|
| `AGENTS.md` line 23 | Says "Matter.js via CDN" — site uses `vendor/matter.min.js` (local bundle). `docs/REFERENCE-2026-06-25-layout-boot.md` is correct. |
| `js/physics-engine.js` error message | Still mentions "CDN blocked" though Matter is local |

### 9b. Docs not indexed in `docs/README.md`

| File | Content | Recommendation |
|------|---------|----------------|
| `docs/architecture/site-grid.md` | Site shell grid (`CONFIG.siteGrid`) | **KEEP** — add link to `docs/README.md` or leave as-is |
| `docs/REFERENCE-2026-06-25-layout-boot.md` | Boot/layout restore point | **KEEP** — valuable regression reference |
| `docs/REFERENCE-2026-06-28-navigation-map-scaling.md` | Minimap scaling restore point | **KEEP** |
| `docs/work/2026-06-22-l2-grid-stable.md` | Completed work session | **KEEP** as history or archive to `docs/work/archive/` |

### 9c. Work session template

`docs/work/TEMPLATE.md` — **KEEP** (project convention per `AGENTS.md`).

**None of these are deletion candidates** unless you want a leaner docs folder post-exhibition.

---

## 10. Config — stale or confusing keys

| Key | Current value | Issue |
|-----|---------------|-------|
| `CONFIG.depth.layoutMode` | `'legacy-grid'` | Only applies when `depthEngine === 'legacy'`; misleading while V2 is active |
| `CONFIG.depth.grids.*` | macro/micro presets | Legacy L2/L3; unused in V2 grid path |
| `CONFIG.boot.idleRefreshMs` | `0` (disabled) | `js/idle-refresh.js` still bundled — harmless when 0 |

| Recommendation |
|----------------|
| **KEEP** keys for legacy rollback; optionally add comment in config clarifying V2 ignores `layoutMode` |
| Do **not** delete `idle-refresh.js` — needed if kiosk reload is enabled later |

---

## 11. Data pipeline — CSV columns

`data/main.csv` header includes columns not read by code:

| Column | Used? |
|--------|-------|
| `Typology` | No references in `js/` |
| `oldtags` | No references in `js/` |

Code reads columns by index via `CONFIG.data.columns` (author, id, title, body, tags only).

| Recommendation | Risk |
|----------------|------|
| Remove columns from CSV | **Low** — only if Google Sheet export can be updated to match |
| Keep columns | **Safe** — extra data ignored at parse time |

`data/.gitkeep` — **DELETE** if `data/main.csv` and `data/tags.csv` are always present; harmless either way.

---

## 12. CSS — legacy catalog / transition rules

`styles.css` (~3,171 lines) contains substantial rules for:

- Catalog layout settling (`is-catalog-layout`, `is-catalog-settling`, `is-catalog-lens`)
- Legacy silhouettes (`.meso-silhouette__*`)
- Macro→meso / meso→micro transitions (`is-macro-to-meso`, `is-meso-to-micro`)
- Multiple `meso-mock` gradient modes (see §6)

Under V2, many rules are dormant but still protect against config rollback.

| Recommendation | Risk |
|----------------|------|
| **KEEP** until legacy engine is formally retired | Safest |
| Prune legacy-only CSS | **HIGH** — test all 3 depth levels + block interactions |

---

## 13. `.vscode/settings.json`

```json
"liveServer.settings.port": 5501
```

Local editor preference for Live Server extension. Not used by exhibition launcher.

| Recommendation |
|----------------|
| **KEEP** — personal/editor config; already modified in working tree |

---

## 14. `vendor/matter.min.js`

Local Matter.js 0.19.0 bundle — **required**, referenced by `index.html`. **KEEP.**

---

## 15. Module inventory (reference)

### Bundled into `app.js` (`build-js.sh`)

```
idle-refresh.js, app-state.js,
meso-gradient-visual-preset.js, meso-gradient-sdf-preset.js,
meso-gradient-engine.js, meso-gradient-p5.js,
meso-mock.js, micro-mock.js,
render-engine.js, silhouette-engine.js,
catalog-layout-engine.js, catalog-state.js,
depth-transition-orchestrator.js, macro-meso-bridge.js,
meso-spatial-layout.js, depth-v2.js, depth-focus-links.js,
depth-controller.js, spatial-navigation.js, navigation-map.js,
artifact-inspector.js, physics-engine.js,
warehouse-core.js, warehouse-grid.js, warehouse-filter.js,
warehouse-orbit.js, bootstrap.js
```

### Loaded separately

- `js/config.js` — edited without rebuild (hot refresh)

### Not bundled

- `js/archive/warehouse-filter-frame.js` — archived reference only

### Largest modules (cleanup priority if splitting files later — not deletion)

| File | Lines |
|------|-------|
| `js/app.js` (bundle) | 16,705 |
| `js/meso-mock.js` | 2,313 |
| `js/navigation-map.js` | 2,284 |
| `js/warehouse-orbit.js` | 1,663 |
| `js/physics-engine.js` | 1,645 |
| `js/warehouse-core.js` | 1,451 |
| `js/config.js` | 1,229 |

---

## Suggested Phase 2 order (lowest risk first)

1. Delete untracked screenshots (`site-full.png`, `site-viewport.png`)
2. Delete `assets/fonts/.DS_Store`
3. Delete unused font files (§3b) — **largest size win**
4. Delete `scripts/serve-exhibition.sh` if exhibition docs no longer mention it
5. Fix doc drift (`AGENTS.md` CDN line, physics error message) — edit only, no deletions
6. **Defer** until post-exhibition: legacy engine code, gradient mode pruning, CSS legacy pruning

---

## Items explicitly NOT recommended for deletion

| Item | Reason |
|------|--------|
| `js/app.js` | Runtime bundle; required unless build workflow changes |
| `js/config.js` | Live control panel |
| `data/main.csv`, `data/tags.csv` | Live content pipeline |
| `Start Local Server.command` | Exhibition primary launcher |
| `docs/CHECKPOINT.md` | Stability contract for physics |
| `js/depth-v2.js`, `js/meso-mock.js`, `js/micro-mock.js` | Active V2 display path |
| `js/warehouse-*.js`, `js/physics-engine.js` | Core L1 interaction |
| `js/navigation-map.js` | Active minimap |
| `js/depth-focus-links.js` | Active L1/L2 focus lines |
| `js/catalog-state.js` | Used by V2 filtering/layout state |

---

*End of audit. Awaiting your per-item approval before any deletions.*
