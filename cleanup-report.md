# Cleanup Report — עקבות / my-website

**Generated:** 2026-07-06  
**Scope:** Read-only audit (Phase 1). No existing files were modified or deleted.  
**Active engine:** `CONFIG.depth.depthEngine === 'v2'` (see `js/config.js`)  
**Entry flow:** `index.html` → `opening.html` → `experience.html`

This report supersedes the older audit at `docs/cleanup-report.md` (2026-07-02), which predates the opening screen, `experience.html`, and the current font set.

---

## How to use this report (Phase 2)

1. Review each section and mark items: **DELETE** / **KEEP** / **DEFER**
2. Prefer one category at a time; run `./build-js.sh` and/or `./build-opening.sh` after JS module changes
3. Smoke-test: `opening.html` → כניסה → `experience.html`; L1 physics, L3 grid, warehouse blocks
4. Physics/navigation removals: compare against `docs/CHECKPOINT.md` first
5. Exhibition USB: confirm `Start Local Server.command` still opens the site before deleting launcher files

---

## Summary

| Category | Items | Typical risk |
|----------|-------|--------------|
| Duplicate font file (untracked) | 1 | **Low** |
| Retired / unused font files (tracked) | 6 files (~190 KB) | **Low** |
| Orphan `@font-face` declarations (no active family binding) | MiriamLibre + Neoklass | **Low** |
| Explicitly archived code | 1 JS file + dormant filter-frame runtime | **Low–Medium** |
| Build bundle duplication | `js/app.js` + `js/opening-app.js` | **Medium** (workflow, not accidental) |
| CI gap | `build-opening.sh` not in deploy workflow | **Medium** |
| Legacy depth engine (frozen) | ~6 modules + ~800+ CSS lines | **High** |
| Alternate L2 gradient modes | shader / canvas / blobs / svg / bands | **Medium** |
| Stale documentation | 5+ files with outdated structure | **Low** (edit, not delete) |
| Superseded audit doc | `docs/cleanup-report.md` | **Low** |
| Archive experiment folders | 2 under `docs/archive/` | **Low** (intentional history) |
| CSV unused column | `oldtags` only | **Low** |
| Dev-only script | `scripts/build-meso-silhouette-cache.mjs` | **Low** (keep unless Playwright unused) |

---

## 1. Site entry structure (current vs documented)

### Current (correct)

| File | Role |
|------|------|
| `index.html` | Redirect stub → `opening.html` |
| `opening.html` | Opening threshold; loads `js/config.js` + `js/opening-app.js` |
| `experience.html` | Experience 1 shell; loads `vendor/matter.min.js`, `js/config.js`, `js/app.js` |

### Still documented incorrectly

Several files still describe a single-page `index.html` app or deleted Experience 2 inline shell:

| File | Issue | Recommendation |
|------|-------|----------------|
| `AGENTS.md` | Opening screen marked *planned*; stack lists only `index.html` | **EDIT** — status → built; document three HTML entry points + two build scripts |
| `docs/external-agent-brief.md` | References `ExperienceRouter`, `ArchiveStream`, `#archive-roam` in `index.html` — **all deleted** | **EDIT or archive** — high drift; misleads external agents |
| `docs/CHECKPOINT.md` | Key files table lists `index.html` as app shell | **EDIT** → `experience.html` |
| `docs/REFERENCE-2026-06-25-layout-boot.md` | Boot reference for old single-page layout | **KEEP** as historical restore point; add note at top |
| `docs/work/2026-07-05-opening-screen-plan.md` | Says “no opening screen yet in `index.html`” | **MOVE to archive** or mark done |
| `docs/work/2026-07-06-opening-interactive-threshold-plan.md` | HTML section says “replace button in `index.html`” | **EDIT** → `opening.html` |
| `docs/cleanup-report.md` | Outdated 2026-07-02 audit | **DELETE** after approving this report |

**Verify:** Grep for `ExperienceRouter`, `#archive-roam`, `archive-stream` — should only appear in docs/history, not in `js/` or HTML.

---

## 2. Untracked / junk files

| File | Notes | Recommendation |
|------|-------|----------------|
| `assets/fonts/MiriamLibre-Black (1).woff2` | Untracked; same byte size (27,532 B) as `MiriamLibre-Black.woff2` — macOS duplicate download | **DELETE** |
| `site-full.png`, `site-viewport.png` | Listed in `.gitignore`; not present on disk | **N/A** — already excluded |
| `assets/fonts/.DS_Store` | Not present on disk at audit time | **DELETE** if it reappears |

**Verify:** `ls -la "assets/fonts/MiriamLibre-Black"*` — only one Black file should remain.

---

## 3. Font assets

### 3a. Actively used (KEEP)

Referenced by `@font-face` in `styles.css` **and** bound to live CSS variables / classes:

| File | Used by |
|------|---------|
| `NarkissYair-Regular-TRIAL.woff2` | `@font-face` weight 400 (fallback) |
| `NarkissYair-Bold-TRIAL.woff2` | `.general-h`, layer nav, `--type-family-general-h` |
| `NarkissYair-BoldMono-TRIAL.woff2` | `.general-t`, warehouse chrome, `--type-family-general-t` |
| `TheBasics-Dots.woff2` | `.note-h`, `--type-family-note-h` |
| `FrankRuhl_Universal-Mono.woff2` | `.note-t`, `--type-family-note-t` |
| `HelveticaNeue-01.woff2` | Body fallback |

Also preloaded in `js/config.js` → `CONFIG.boot.fontPreload`.

### 3b. Tracked but unused by current CSS (safe deletion candidates)

These files are in git but **not referenced** in any `@font-face` or JS path:

| File | Notes |
|------|-------|
| `NarkissTam-Regular-TRIAL.woff2` | Retired per `docs/visual-language.md` (“Retired: NarkissTam on note body”) |
| `Ratzif22-Regular.woff2` | Retired per visual-language |
| `Ratzif22-Medium.woff2` | Retired |
| `Ratzif22-Bold.woff2` | Retired |
| `MiriamLibre-Regular.woff2` | No `@font-face`; not in type tokens |
| `MiriamLibre-Medium.woff2` | Same |
| `MiriamLibre-Stencil.woff2` | Same |

### 3c. `@font-face` declared but not bound to active type tokens

These `@font-face` blocks exist in `styles.css` but **no CSS variable or class** currently sets `font-family` to `"MiriamLibre"` or `"Neoklass"` (note titles use `TheBasicsDots`; legacy aliases map display → note-h):

| File | `@font-face` | Active binding? |
|------|--------------|-----------------|
| `MiriamLibre-Bold.woff2` | weight 700 | **No** — leftover from Jul 5 type trials (see visual-language changelog) |
| `MiriamLibre-Black.woff2` | weight 900 | **No** |
| `Neoklass-MediumItalic-TRIAL.woff2` | weight 500 italic | **No** |
| `Neoklass-BoldItalic-TRIAL.woff2` | weight 700 italic | **No** |

| Option | Recommendation |
|--------|----------------|
| Remove files + `@font-face` blocks | **Safe** if exhibition type is locked to TheBasics/FrankRuhl/NarkissYair |
| Keep for quick re-trial | **DEFER** until typography is final |

### 3d. Redundant `@font-face` (not a file deletion)

`NarkissYairMono` declares both weight 400 and 700 pointing to the same `NarkissYair-BoldMono-TRIAL.woff2` file. Intentional mono rendering hack — **KEEP** unless simplifying font loading.

**Verify after font cleanup:** Load `opening.html` and `experience.html`; check warehouse labels, layer nav, L3 note titles/bodies, inspector.

---

## 4. Build system — bundles and duplication

### 4a. Two build pipelines (intentional)

| Script | Output | Loaded by | Modules |
|--------|--------|-----------|---------|
| `./build-js.sh` | `js/app.js` (~20,309 lines) | `experience.html` | 30 source modules |
| `./build-opening.sh` | `js/opening-app.js` (~4,290 lines) | `opening.html` | 9 source modules |

`js/config.js` loads separately on both pages — edit + hard refresh, no build needed.

### 4b. Shared modules concatenated into both bundles

These meso/gradient modules appear in **both** build scripts (code duplicated in output files, not in source):

```
meso-gradient-visual-preset.js
meso-gradient-sdf-preset.js
meso-gradient-engine.js
meso-gradient-p5.js
meso-silhouette-cache.js
meso-mock.js
```

This is **intentional** (opening page needs meso art without the full physics stack). Not a deletion candidate unless you refactor to a shared pre-built chunk (out of scope for simple cleanup).

### 4c. CI / deploy gap

`.github/workflows/deploy-pages.yml` runs only `./build-js.sh`.

| Issue | Risk |
|-------|------|
| Opening module edits without local `./build-opening.sh` before deploy → stale `opening-app.js` on GitHub Pages | **Medium** |

| Recommendation |
|----------------|
| Add `./build-opening.sh` to deploy workflow, **or** document that both scripts must be run before publish |

### 4d. Bundled outputs — do not delete

| File | Reason |
|------|--------|
| `js/app.js` | Required runtime for Experience 1 |
| `js/opening-app.js` | Required runtime for opening screen |

**Do not edit bundles by hand** — `build-js.sh` / `build-opening.sh` overwrite them.

---

## 5. JavaScript module inventory

### 5a. Loaded at runtime

| File | How loaded |
|------|------------|
| `js/config.js` | `<script>` in `opening.html` and `experience.html` |
| `js/app.js` | Bundled — `experience.html` |
| `js/opening-app.js` | Bundled — `opening.html` |
| `vendor/matter.min.js` | `experience.html` only |

### 5b. Source modules in `./build-js.sh` (30 files)

```
idle-refresh.js, text-direction.js, app-state.js,
meso-gradient-visual-preset.js, meso-gradient-sdf-preset.js,
meso-gradient-engine.js, meso-gradient-p5.js, meso-silhouette-cache.js,
meso-mock.js, micro-mock.js, render-engine.js, silhouette-engine.js,
catalog-layout-engine.js, catalog-state.js,
depth-transition-orchestrator.js, macro-meso-bridge.js,
meso-spatial-layout.js, depth-v2.js, depth-focus-links.js,
depth-controller.js, spatial-navigation.js, navigation-map.js,
artifact-inspector.js, physics-engine.js,
warehouse-core.js, warehouse-grid.js, warehouse-filter.js,
warehouse-orbit.js, l3-terminal.js, bootstrap.js
```

### 5c. Source modules in `./build-opening.sh` only (3 unique)

```
opening-data.js, opening-screen.js, opening-bootstrap.js
```

(Plus the 6 shared meso modules listed in §4b.)

### 5d. Not bundled — archived reference

| File | Status | Recommendation |
|------|--------|----------------|
| `js/archive/warehouse-filter-frame.js` | Documented archive; not in any build | **KEEP** if feature may return; **DELETE** if abandoned |

### 5e. Misleading filename — still required

| File | Note |
|------|------|
| `js/warehouse-filter.js` | Name suggests filter-frame only, but implements **active** bank-grid realignment, filter-exit peel/hollow animations, and physics suspension. **Do not delete.** |

---

## 6. Dormant / archived features

### 6a. Filter frame block (warehouse)

| Piece | Status |
|-------|--------|
| `CONFIG.warehouse.enableFilterFrame: false` | Disabled |
| `js/archive/warehouse-filter-frame.js` | Reference implementation, not bundled |
| Hooks in `js/warehouse-core.js` | Guarded by `enableFilterFrame` |
| CSS `.action-block--frame-filter` | Present in `styles.css` |

| Recommendation | Risk |
|----------------|------|
| **KEEP** archive + dormant hooks | Safest |
| Delete archive file only | **Low** |
| Delete archive + hooks + CSS | **Medium** — only if feature is permanently abandoned |

### 6b. Experience 2 inline sketch (deleted)

Per `docs/work/2026-07-06-l3-terminal-word-grid-followup.md`: the brick-wall / `#archive-roam` / `ExperienceRouter` path was **removed**.

| Missing files (correctly absent) | `js/experience-router.js`, `js/archive-stream.js`, `js/archive-index.js` |
| Stale references | `docs/external-agent-brief.md` still documents them as active |

**Recommendation:** Update `docs/external-agent-brief.md`; do not restore deleted modules unless starting Experience 2 anew.

### 6c. Toroidal infinite scroll experiment

Archived under `docs/archive/2026-07-05-toroidal-infinite-scroll/` (patch + `toroidal-pan.js` copy).

| Recommendation |
|----------------|
| **KEEP** as experiment archive — intentional history |

Note: `js/text-direction.js` is **live again** (bundled in `build-js.sh`) for LTR/English notes — distinct from the toroidal experiment archive copy.

---

## 7. Legacy depth engine (frozen, still bundled)

**Config:** `depthEngine: 'v2'`. Legacy path remains for rollback (`docs/architecture/depth-legacy.md`).

### 7a. Modules primarily serving legacy mode

| Module | V2 usage today |
|--------|----------------|
| `depth-transition-orchestrator.js` | Bypassed when V2 active; still referenced with guards |
| `macro-meso-bridge.js` | Macro→meso animation; skipped in V2 wheel path |
| `catalog-layout-engine.js` | Legacy-grid branch; V2 uses `depth-v2.js` |
| `silhouette-engine.js` | `onLevelEnter` no-op in V2; **still used** by `meso-mock.js` for `measureElementLineRects` + opening art |
| `catalog-state.js` | **Active** in V2 (filter/layout state) |
| `meso-spatial-layout.js` | **Active** in V2 grid sorting |

### 7b. Legacy DOM still injected

`js/render-engine.js` injects `.meso-silhouette` SVG markup; V2 hides via CSS (`body.is-depth-v2 .meso-silhouette`). Nodes remain in DOM.

### 7c. Legacy CSS in `styles.css` (~4,897 lines total)

Dormant under V2 but protect config rollback:

- `is-catalog-layout`, `is-catalog-settling`, `is-catalog-lens`
- `is-macro-to-meso`, `is-meso-to-micro`
- `.meso-silhouette__*` rules
- No remaining `archive-roam` / `experience-archive` rules (already cleaned)

| Recommendation | Risk |
|----------------|------|
| **KEEP** until post-exhibition | Safest |
| Prune legacy CSS/modules | **HIGH** |

---

## 8. Alternate L2 gradient modes (inactive path)

**Active:** `CONFIG.depth.v2.meso.mockGradientMode: 'p5'`

Still in codebase for preset switching:

| Mode | Code |
|------|------|
| `p5` | `js/meso-gradient-p5.js` — **active** |
| `shader` | `meso-gradient-engine.js`, SDF/visual presets |
| `canvas`, `blobs`, `svg`, `bands` | builders in `js/meso-mock.js` + CSS `[data-gradient-mode=…]` |

| Recommendation | Risk |
|----------------|------|
| **KEEP** while iterating L2/opening art | Low storage cost |
| Remove non-p5 modes | **Medium** — documented rollback in `docs/architecture/meso-gradient-p5-baseline.md` |

---

## 9. Assets and cache

| Asset | Size | Referenced? | Recommendation |
|-------|------|-------------|----------------|
| `assets/cache/meso-silhouettes.json` | ~420 KB | Yes — `CONFIG` + `MesoSilhouetteCache` | **KEEP** |
| `assets/ui/layer-nav-marker.svg` | small | `navigation-map.js` | **KEEP** |
| `assets/ui/decoration-corner-tr.svg` | small | `styles.css`, `CONFIG.warehouse.dock` | **KEEP** |
| `data/main.csv`, `data/tags.csv` | live content | Data pipeline | **KEEP** |
| `data/.gitkeep` | empty marker | Redundant while CSVs exist | **DELETE** optional |

### Regeneration script

| File | Purpose | Recommendation |
|------|---------|----------------|
| `scripts/build-meso-silhouette-cache.mjs` | Playwright-based cache builder | **KEEP** — dev tool; requires Playwright installed locally |

---

## 10. Exhibition launchers

| Entry point | Role | Recommendation |
|-------------|------|----------------|
| `Start Local Server.command` | Primary — Python/Ruby HTTP + opens `http://127.0.0.1:PORT/` (→ `index.html` → opening) | **KEEP** |
| `Start Site.app` | macOS wrapper → same `.command` | **KEEP** for double-click UX |
| `EXHIBITION-START-HERE.txt` | Handoff instructions | **KEEP** |
| `READ ME FIRST — macOS security.txt` | Gatekeeper help | **KEEP** |

No `scripts/serve-exhibition.sh` present (removed since 2026-07-02 audit).

---

## 11. Scripts

| File | Purpose | Recommendation |
|------|---------|----------------|
| `build-js.sh` | Rebuild Experience 1 bundle | **KEEP** — required |
| `build-opening.sh` | Rebuild opening bundle | **KEEP** — required |
| `scripts/setup-git.sh` | One-shot git init helper | **KEEP** or move to docs |

---

## 12. Documentation — work sessions

Active sessions in `docs/work/` (not deletion candidates unless you want a leaner folder):

| File | Status hint |
|------|-------------|
| `2026-07-04-layer-navigation-followup.md` | Follow-up |
| `2026-07-05-depth-block-bar-followup.md` | Follow-up |
| `2026-07-05-experience-2-archive-roaming-plan.md` | Planning — Experience 2 not built |
| `2026-07-05-experience-2-develop.md` | Open stub |
| `2026-07-05-focus-note-followup.md` | Follow-up |
| `2026-07-05-layer-navigation-followup.md` | Follow-up |
| `2026-07-05-opening-screen-plan.md` | **Stale** — opening is built |
| `2026-07-06-l3-terminal-word-grid-followup.md` | Recent — authoritative on entry flow |
| `2026-07-06-opening-interactive-threshold-plan.md` | Planned next phase |
| `archive/2026-06-22-l2-grid-stable.md` | Completed — archived |

| Recommendation |
|----------------|
| **MOVE** completed/stale sessions to `docs/work/archive/` rather than delete |

---

## 13. Config — stale or confusing keys

| Key | Issue |
|-----|-------|
| `CONFIG.depth.layoutMode: 'legacy-grid'` | Only applies when `depthEngine === 'legacy'` |
| `CONFIG.depth.grids.*` | Legacy L2/L3 presets; unused in V2 grid path |
| `CONFIG.boot.idleRefreshMs: 0` | Disables kiosk reload; `idle-refresh.js` still bundled harmlessly |
| `CONFIG.warehouse.enableFilterFrame: false` | Dormant feature flag |

| Recommendation |
|----------------|
| **KEEP** keys for rollback; add clarifying comments in `config.js` if desired |
| Do **not** delete `idle-refresh.js` without removing kiosk-reload intent |

---

## 14. Data pipeline — CSV columns

`data/main.csv` header: `…,tags,Typology,,oldtags`

| Column / index | Used? |
|----------------|-------|
| `typology` (index 9) | **Yes** — `CONFIG.data.columns.typology` |
| `direction` override (index 10) | **Yes** — optional LTR/RTL override |
| `Classification` (index 5) | **No** — values like `note`; not mapped |
| `oldtags` (index 11) | **No** — no code references |

| Recommendation | Risk |
|----------------|------|
| Remove `oldtags` from CSV + Google Sheet export | **Low** — if sheet can be updated |
| Keep extra columns | **Safe** — ignored at parse time |

---

## 15. CSS — minor internal duplication

`.note-h` / `.note-t` are declared twice:

1. Lines ~1191–1204 — direct exhibition classes
2. Lines ~1210–1225 — legacy alias block (`.type-display`, `.note-title`, …)

Both sets are active (legacy selectors still match DOM from `micro-mock.js`). Consolidation is a **refactor**, not urgent cleanup.

---

## 16. `.vscode/settings.json`

Live Server port preference (`5501`). Editor-local — **KEEP**.

---

## 17. Largest source files (reference — not deletion targets)

| File | Lines |
|------|-------|
| `js/app.js` (bundle) | 20,309 |
| `js/meso-mock.js` | 2,580 |
| `js/navigation-map.js` | 2,833 |
| `js/warehouse-core.js` | 2,182 |
| `js/physics-engine.js` | 1,869 |
| `js/config.js` | 1,659 |
| `js/opening-app.js` (bundle) | 4,290 |
| `styles.css` | 4,897 |

---

## Suggested Phase 2 order (lowest risk first)

1. Delete untracked duplicate `assets/fonts/MiriamLibre-Black (1).woff2`
2. Delete retired font files (§3b) — ~190 KB savings
3. Optionally remove orphan MiriamLibre/Neoklass `@font-face` + files (§3c) after confirming typography is locked
4. Delete superseded `docs/cleanup-report.md`
5. Update stale docs (`AGENTS.md`, `docs/external-agent-brief.md`, `docs/CHECKPOINT.md`) — edits only
6. Add `./build-opening.sh` to GitHub Pages workflow
7. Move stale work sessions to `docs/work/archive/`
8. **Defer** until post-exhibition: legacy engine modules, gradient mode pruning, legacy CSS pruning, filter-frame feature removal

---

## Items explicitly NOT recommended for deletion

| Item | Reason |
|------|--------|
| `js/app.js`, `js/opening-app.js` | Runtime bundles |
| `js/config.js` | Live control panel |
| `experience.html`, `opening.html`, `index.html` | Entry flow |
| `data/main.csv`, `data/tags.csv` | Content pipeline |
| `assets/cache/meso-silhouettes.json` | Opening + meso performance |
| `Start Local Server.command` | Exhibition primary launcher |
| `docs/CHECKPOINT.md` | Physics stability contract |
| `js/depth-v2.js`, `js/meso-mock.js`, `js/micro-mock.js`, `js/l3-terminal.js` | Active V2 + L3 terminal |
| `js/warehouse-*.js`, `js/physics-engine.js` | Core L1 interaction |
| `js/text-direction.js` | Active LTR note support |
| `js/navigation-map.js` | Active minimap |
| `js/silhouette-engine.js`, `js/meso-silhouette-cache.js` | Opening art + meso geometry |
| `vendor/matter.min.js` | Offline physics |
| `docs/archive/*` | Intentional experiment/pre-redesign history |

---

*End of audit. Awaiting your per-item approval before any deletions or edits.*
