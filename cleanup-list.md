# Cleanup List — performance first

Mark each line: **DELETE** · **KEEP** · **EDIT** · **DEFER**

Details: [`cleanup-report.md`](cleanup-report.md)

---

## 1. Actually costs CPU / memory

- [x] **Hidden silhouette DOM** — skipped in V2 (`render-engine.js`) + `./build-js.sh`
- [x] **Shader gradient stack (opening)** — removed from `build-opening.sh` + rebuild (~600 lines saved)
- [ ] **Shader gradient stack (experience)** — still in `build-js.sh` if p5 is final
- [ ] **Alternate L2 modes in `meso-mock.js`** — canvas / blobs / svg / bands

---

## 2. Startup parse only — defer post-exhibition

- [ ] `depth-transition-orchestrator.js`
- [ ] `macro-meso-bridge.js`
- [ ] `catalog-layout-engine.js`

---

## 3. Do NOT delete

| Module | Why |
|--------|-----|
| `warehouse-filter.js` | Physics tick + filter peel |
| `silhouette-engine.js` | Line measurement for meso-mock |
| `meso-mock.js`, `meso-gradient-p5.js` | L2/L3/opening bakes |
| Core L1 modules | Required |

---

## 4. Already zero cost — skip

- `idle-refresh.js`, `enableFilterFrame`, `js/archive/warehouse-filter-frame.js`

---

## 5. Safe file deletes — done 2026-07-06

- [x] `assets/fonts/MiriamLibre-Black (1).woff2`
- [x] `NarkissTam-Regular-TRIAL.woff2`, `Ratzif22-*.woff2`, unused `MiriamLibre-{Regular,Medium,Stencil}.woff2`
- [x] `docs/cleanup-report.md`

**Still optional (typography trials — `@font-face` remains in CSS):**

- [ ] `MiriamLibre-Bold.woff2`, `MiriamLibre-Black.woff2`
- [ ] `Neoklass-MediumItalic-TRIAL.woff2`, `Neoklass-BoldItalic-TRIAL.woff2`

---

## Remaining suggested order

1. Remove shader modules from `build-js.sh` (if p5 locked)
2. Defer legacy depth modules until post-exhibition
3. Optional: orphan MiriamLibre/Neoklass fonts + `@font-face`
